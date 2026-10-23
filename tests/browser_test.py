"""Browser integration tests. API routes below are explicit TEST FIXTURES, never production fallbacks."""
import functools
import json
from pathlib import Path
import threading
import unittest
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)

def coin(id='bitcoin', name='Bitcoin', price=100, change=3, updated='2026-10-23T12:00:00Z'):
    return dict(id=id, name=name, symbol=id[:3], current_price=price, price_change_percentage_24h=change, market_cap=1000000, last_updated=updated)

POOLS = {'data': [{'id':'eth_pool','attributes':{'name':'New / ETH','base_token_price_usd':'0.0003','reserve_in_usd':'20000','pool_created_at':'2026-10-23T11:00:00Z','price_change_percentage':{'h24':'-2'}},'relationships':{'base_token':{'data':{'id':'eth_token'}}}}], 'included':[{'id':'eth_token','attributes':{'name':'New Token','symbol':'NEW'}}]}

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class DashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'
        cls.playwright=sync_playwright().start()
        cls.browser=cls.playwright.chromium.launch(executable_path='/usr/bin/chromium')
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.playwright.stop();cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1672,'height':1000})
        self.page=self.context.new_page();self.page.clock.install(time=NOW)
        self.errors=[];self.page.on('pageerror',lambda error:self.errors.append(str(error)))
        self.api_mode='ok';self.requests=[]
        self.page.route('https://api.coingecko.com/**',self.market_route)
        self.page.route('https://api.geckoterminal.com/**',lambda r:r.fulfill(json=POOLS))
    def tearDown(self):
        self.context.close();self.assertEqual(self.errors,[])
    def market_route(self, route):
        self.requests.append(route.request.url)
        if self.api_mode=='error':route.fulfill(status=503,json={'error':'unavailable'});return
        if self.api_mode=='limit':route.fulfill(status=429,json={'error':'rate limit'});return
        if self.api_mode=='invalid':route.fulfill(json={'unexpected':'data'});return
        if self.api_mode=='stale':data=[coin(updated='2026-10-23T11:54:59Z')]
        elif self.api_mode=='missing':data=[coin(price=None,change=None,updated=None)]
        elif parse_qs(urlparse(route.request.url).query).get('page')==['3']:data=[coin('small-token','Small Token',0.03,-7)]
        else:data=[coin(),coin('ethereum','Ethereum',50,-5)]
        route.fulfill(json=data)
    def start(self):
        self.page.goto(self.url)
        expect(self.page.locator('#data-status')).not_to_contain_text('Hämtar')
    def close_dialog(self):self.page.locator('#close-dialog').click()
    def trade(self, side, qty):
        self.page.locator('#trade-costs').uncheck()
        self.page.locator('#trade-side').select_option(side)
        self.page.locator('#trade-quantity').fill(str(qty))
        self.page.get_by_role('button',name='Bekräfta simulerad order',exact=True).click()
    def test_all_panels_tools_keyboard_and_responsive_layout(self):
        self.start()
        self.assertEqual(self.page.locator('.market > *').count(),5)
        self.assertEqual(self.page.locator('.gridmain > *').count(),3)
        self.assertEqual(self.page.locator('.departments > *').count(),5)
        self.assertEqual(self.page.locator('.bottom > *').count(),3)
        expect(self.page.locator('time[data-zone="Europe/Stockholm"]').first).to_have_text('14:00')
        expect(self.page.locator('time[data-zone="America/New_York"]').first).to_have_text('08:00')
        for opener in self.page.locator('[data-action]').all():
            opener.click()
            expect(self.page.locator('#dialog')).to_be_visible()
            expect(self.page.locator('#dialog-title')).not_to_be_empty()
            self.page.keyboard.press('Escape')
            expect(self.page.locator('#dialog')).not_to_be_visible()
            expect(opener).to_be_focused()
        for width in [1920,1440,1024,850,768,600,390,320]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertEqual(self.page.evaluate('document.documentElement.scrollWidth'),width,f'overflow at {width}')
        self.page.get_by_role('button',name='Pausa stad').click()
        expect(self.page.locator('body')).to_have_class('paused')
        self.page.emulate_media(reduced_motion='reduce')
        self.assertEqual(self.page.locator('.walker').first.evaluate('e=>getComputedStyle(e).animationName'),'none')
    def test_real_components_chat_channels_and_safe_text(self):
        self.start()
        self.page.locator('#message').fill('<img src=x onerror=alert(1)>')
        self.page.get_by_role('button',name='Skicka meddelande',exact=True).click()
        expect(self.page.locator('#messages')).to_contain_text('<img src=x onerror=alert(1)>')
        self.assertEqual(self.page.locator('#messages img').count(),0)
        self.page.locator('#message').fill('/analys');self.page.locator('#chat').evaluate('e=>e.requestSubmit()')
        expect(self.page.locator('#messages')).to_contain_text('CoinGecko')
        self.page.locator('[data-channel="agents"]').click()
        expect(self.page.locator('#messages')).not_to_contain_text('<img')
        self.page.locator('[data-channel="shared"]').click()
        self.page.reload();expect(self.page.locator('#messages')).to_contain_text('<img')
    def test_token_categories_search_and_new_pool_limitations(self):
        self.start()
        self.page.locator('#search').fill('ethereum')
        expect(self.page.locator('#coins tr')).to_have_count(1)
        self.page.locator('[data-category="small"]').click()
        expect(self.page.locator('#coins')).to_contain_text('Small Token')
        self.assertTrue(any('per_page=250&page=3' in url for url in self.requests))
        self.page.locator('[data-category="new"]').click()
        expect(self.page.locator('#coins')).to_contain_text('New Token')
        expect(self.page.locator('#data-source')).to_contain_text('inte nödvändigtvis nya tokens')
        self.page.get_by_role('button',name='Pooldetaljer',exact=True).click()
        expect(self.page.locator('#dialog-content')).to_contain_text('Ingen paper trading')
        expect(self.page.locator('#dialog-content')).to_contain_text('eth_token')
    def test_buy_sell_validation_persistence_scenarios_and_export(self):
        self.start();self.page.get_by_role('button',name='Paper-order',exact=True).first.click()
        self.trade('buy',2);expect(self.page.locator('.form-result')).to_contain_text('genomförd')
        expect(self.page.locator('#cash')).to_contain_text('9 800'.replace(' ','\xa0'))
        self.trade('buy',1000);expect(self.page.locator('.form-result')).to_contain_text('Otillräckligt')
        self.trade('sell',3);expect(self.page.locator('.form-result')).to_contain_text('fler tokens')
        self.trade('sell',1);expect(self.page.locator('.form-result')).to_contain_text('genomförd')
        self.close_dialog();self.page.reload()
        expect(self.page.locator('#trade-count')).to_have_text('2')
        self.page.locator('[data-action="scenario"]').click()
        self.page.get_by_role('button',name='Beräkna scenario').click()
        expect(self.page.locator('#dialog-content')).to_contain_text('9\xa0990,00')
        self.close_dialog();self.page.locator('[data-action="report"]').click()
        with self.page.expect_download() as info:self.page.get_by_role('button',name='Exportera rapport (JSON)',exact=True).click()
        exported=json.loads(Path(info.value.path()).read_text())
        self.assertEqual(len(exported['ledger']),2);self.assertEqual(exported['wallet']['cash'],9900)
    def test_stale_and_missing_quotes_cannot_trade(self):
        for mode in ['stale','missing']:
            self.api_mode=mode;self.start()
            self.page.get_by_role('button',name='Paper-order',exact=True).first.click()
            self.trade('buy',1)
            expect(self.page.locator('.form-result')).to_contain_text('Kursen saknas')
            expect(self.page.locator('#trade-count')).to_have_text('0');self.close_dialog()
    def test_provider_failures_never_invent_prices(self):
        for mode,text in [('error','503'),('limit','429'),('invalid','oväntat format')]:
            self.api_mode=mode;self.start()
            expect(self.page.locator('#data-status')).to_contain_text(text)
            self.assertEqual(self.page.get_by_role('button',name='Paper-order',exact=True).count(),0)
            expect(self.page.locator('#suggestions')).to_contain_text('Inga förslag')
    def test_failed_refresh_preserves_rows_but_ages_block_trading(self):
        self.start();self.api_mode='error';self.page.clock.fast_forward(60001)
        expect(self.page.locator('#refresh')).to_be_enabled();self.page.locator('#refresh').click()
        expect(self.page.locator('#data-status')).to_contain_text('Tidigare data visas')
        expect(self.page.locator('#coins')).to_contain_text('Bitcoin')
        self.page.clock.fast_forward(300001)
        self.page.get_by_role('button',name='Paper-order',exact=True).first.click();self.trade('buy',1)
        expect(self.page.locator('.form-result')).to_contain_text('Kursen saknas')
    def test_storage_unavailable_does_not_break_app(self):
        self.context.add_init_script("Storage.prototype.getItem=()=>{throw new Error('denied')};Storage.prototype.setItem=()=>{throw new Error('denied')}")
        self.start();expect(self.page.locator('#storage-status')).to_contain_text('minnet')
        self.page.get_by_role('button',name='Paper-order',exact=True).first.click();self.trade('buy',1)
        expect(self.page.locator('.form-result')).to_contain_text('genomförd')
    def test_corrupt_ledger_is_preserved_until_explicit_reset(self):
        self.context.add_init_script("if(!localStorage.getItem('ponce-nova:v1'))localStorage.setItem('ponce-nova:v1','{broken')")
        self.start();expect(self.page.locator('#storage-status')).to_contain_text('bevaras')
        self.assertEqual(self.page.evaluate("localStorage.getItem('ponce-nova:v1')"),'{broken')
        self.page.locator('[data-action="privacy"]').click()
        self.page.get_by_role('button',name='Radera lokala data',exact=True).click()
        expect(self.page.locator('#dialog')).to_be_visible()
        self.page.locator('#confirm-reset').check();self.page.get_by_role('button',name='Radera lokala data',exact=True).click()
        expect(self.page.locator('#dialog')).not_to_be_visible()
        self.assertIsNone(self.page.evaluate("localStorage.getItem('ponce-nova:v1')"))
    def test_cached_categories_cancel_inflight_request_without_stuck_loading(self):
        self.start();self.page.locator('[data-category="small"]').click()
        expect(self.page.locator('#coins')).to_contain_text('Small Token')
        self.page.locator('[data-category="large"]').click()
        expect(self.page.locator('#coins')).to_contain_text('Bitcoin')
        expect(self.page.locator('#data-status')).not_to_contain_text('Hämtar')
        self.assertEqual(len(self.requests),2)

    def test_auto_refresh_can_be_paused_and_resumes_with_real_changed_prices(self):
        self.start()
        self.page.locator('#auto-market').uncheck()
        self.page.clock.fast_forward(65001)
        self.assertEqual(len(self.requests),1)
        self.page.route('https://api.coingecko.com/**',lambda r:r.fulfill(json=[coin(price=120,updated='2026-10-23T12:01:00Z')]))
        self.page.locator('#auto-market').check()
        expect(self.page.locator('#coins')).to_contain_text('120,00')
        self.assertEqual(self.page.locator('#coins tr').count(),1)
        self.page.get_by_role('button',name='Paper-order',exact=True).click()
        self.page.locator('#trade-quantity').fill('1')
        expect(self.page.locator('#trade-costs')).to_be_checked()
        self.page.get_by_role('button',name='Bekräfta simulerad order',exact=True).click()
        expect(self.page.locator('.form-result')).to_contain_text('genomförd')
        saved=self.page.evaluate("JSON.parse(localStorage.getItem('ponce-nova:v1'))")
        self.assertAlmostEqual(saved['ledger'][0]['price'],120.06)
        self.assertAlmostEqual(saved['ledger'][0]['fee'],0.12006)
        self.page.keyboard.press('Escape');self.page.reload()
        expect(self.page.locator('#trade-count')).to_have_text('1')

    def test_auto_refresh_obeys_retry_after_and_never_relabels_old_quotes(self):
        self.start()
        source=self.page.locator('#data-source').inner_text()
        failed=[]
        def limited(route):
            failed.append(route.request.url)
            route.fulfill(status=429,headers={'Retry-After':'180','Access-Control-Expose-Headers':'Retry-After'},json={'error':'quota'})
        self.page.route('https://api.coingecko.com/**',limited)
        self.page.clock.fast_forward(65001)
        expect(self.page.locator('#data-status')).to_contain_text('429')
        expect(self.page.locator('#data-source')).to_have_text(source)
        self.page.clock.fast_forward(130000)
        expect(self.page.locator('#refresh')).to_be_disabled()
        self.assertEqual(self.page.locator('#coins tr').count(),2)
        self.assertEqual(len(failed),1)

    def test_chat_scroll_preserves_reader_position_and_keeps_composer_outside(self):
        self.context.add_init_script("""localStorage.setItem('ponce-nova:v1',JSON.stringify({version:1,ledger:[],chats:{shared:Array.from({length:40},(_,i)=>({author:'Nova',text:'Meddelande '+i+' '+('Långt agentsvar. '.repeat(20)),time:Date.now(),kind:'ai'})),agents:[]},events:[]}));""")
        self.start()
        for width in [1440,390,320]:
            self.page.set_viewport_size({'width':width,'height':900})
            box=self.page.locator('#messages')
            self.assertTrue(box.evaluate('e=>e.scrollHeight>e.clientHeight'))
            self.assertLessEqual(box.evaluate('e=>e.clientHeight'),280)
            box.focus();self.page.keyboard.press('Control+Home')
            self.page.wait_for_function("document.querySelector('#messages').scrollTop < 32")
            expect(self.page.locator('#chat-latest')).to_be_visible()
            self.page.locator('#message').fill('Ett nytt meddelande')
            self.page.locator('#chat').evaluate('e=>e.requestSubmit()')
            self.assertLess(box.evaluate('e=>e.scrollTop'),32)
            self.assertGreater(self.page.locator('#message').bounding_box()['y'],box.bounding_box()['y']+box.bounding_box()['height'])
            self.page.locator('#chat-latest').click()
            expect(self.page.locator('#chat-latest')).to_be_hidden()
            self.assertLess(box.evaluate('e=>e.scrollHeight-e.clientHeight-e.scrollTop'),32)
            self.assertEqual(self.page.evaluate('document.documentElement.scrollWidth'),width)

if __name__=='__main__':unittest.main(verbosity=2)
