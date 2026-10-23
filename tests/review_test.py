"""Test the self-contained review artifact; optionally test file:// on an unmanaged browser."""
import importlib.util
import functools
import os
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import unittest
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_review', ROOT / 'tools' / 'build_review.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


class ReviewFileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = builder.build()
        first = cls.output.read_bytes()
        builder.build()
        assert first == cls.output.read_bytes(), 'Review bundle must be reproducible'
        cls.server = ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(cls.output.parent)))
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url = cls.output.as_uri() if os.environ.get('PONCE_REVIEW_FILE_URL')=='1' else f'http://127.0.0.1:{cls.server.server_port}/{cls.output.name}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path='/usr/bin/chromium')
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1440, 'height':1000})
        self.page = self.context.new_page()
        self.page.clock.install(time=datetime(2026,10,23,12,tzinfo=timezone.utc))
        self.errors = []; self.requests = []
        self.page.on('pageerror', lambda e:self.errors.append(str(e)))
        self.page.on('request', lambda r:self.requests.append(r.url))
        self.page.route('https://api.coingecko.com/**', lambda r:r.fulfill(json=[{'id':'bitcoin','name':'Bitcoin','symbol':'btc','current_price':100,'market_cap':1000000,'price_change_percentage_24h':2,'last_updated':'2026-10-23T12:00:00Z'}]))
    def tearDown(self):
        self.context.close(); self.assertEqual(self.errors, [])
    def start(self):
        self.page.goto(self.url)
        expect(self.page.locator('.review-banner')).to_contain_text('FÖRHANDSVISNING')
        expect(self.page.locator('#coins')).to_contain_text('Bitcoin')
    def test_self_contained_no_dependency_requests_and_all_dialogs(self):
        self.start()
        for opener in self.page.locator('[data-action]').all():
            opener.click(); expect(self.page.locator('#dialog')).to_be_visible()
            self.page.keyboard.press('Escape')
        asset_requests = [url for url in self.requests if url.startswith('file:') or url.startswith('http://127.0.0.1:')]
        self.assertEqual(asset_requests, [self.url])
        self.assertIn('data:image/jpeg;base64,', self.page.locator('.portrait').first.evaluate('e=>getComputedStyle(e).backgroundImage'))
        expect(self.page.locator('time[data-zone="Europe/Stockholm"]').first).to_have_text('14:00')
    def test_separate_storage_buy_chat_and_reload(self):
        self.start()
        self.page.get_by_role('button',name='Paper-order',exact=True).click()
        self.page.locator('#trade-quantity').fill('2')
        self.page.get_by_role('button',name='Bekräfta simulerad order',exact=True).click()
        expect(self.page.locator('.form-result')).to_contain_text('genomförd')
        self.page.keyboard.press('Escape')
        self.page.locator('#message').fill('/saldo')
        self.page.get_by_role('button',name='Skicka meddelande',exact=True).click()
        expect(self.page.locator('#messages')).to_contain_text('9\xa0800')
        self.assertIsNone(self.page.evaluate("localStorage.getItem('ponce-nova:v1')"))
        self.assertIsNotNone(self.page.evaluate("localStorage.getItem('ponce-nova:review:v1')"))
        self.page.reload();expect(self.page.locator('#trade-count')).to_have_text('1')
        expect(self.page.locator('#messages')).to_contain_text('/saldo')
    def test_mobile_and_desktop_widths(self):
        self.start()
        for width in [320,390,768,1440,1920]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertEqual(self.page.evaluate('document.documentElement.scrollWidth'),width)
    def test_real_network_failure_remains_explicit(self):
        self.page.unroute('https://api.coingecko.com/**')
        self.page.route('https://api.coingecko.com/**',lambda r:r.abort('failed'))
        self.page.goto(self.url)
        expect(self.page.locator('#data-status')).to_contain_text('Datafel')
        expect(self.page.locator('#coins')).to_contain_text('Ingen marknadsdata')
        self.assertEqual(self.page.get_by_role('button',name='Paper-order',exact=True).count(),0)

if __name__=='__main__': unittest.main(verbosity=2)
