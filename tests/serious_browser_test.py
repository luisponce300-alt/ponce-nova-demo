"""Serious-test flows, with explicitly stubbed public feeds and shared storage."""
import json
from pathlib import Path
import subprocess
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
PASSWORD='test-only-password-not-real-secret'
RUNNER=r'''
import {createApp} from './server/app.js';
import {validateState} from './server/storage.js';
let revision=0,state={version:1,ledger:[],chats:{shared:[],agents:[]},events:[]};
const storage={configured:true,status:()=>({configured:true,healthy:true}),read:async()=>({revision,state:structuredClone(state)}),write:async(r,s)=>{
 if(r!==revision)throw Object.assign(new Error('En annan enhet har nyare data.'),{status:409});
 state=JSON.parse(JSON.stringify(validateState(s),(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v));return {revision:++revision};
}};
const fetchImpl=async(url)=>{
 if(url.includes('/book?'))return Response.json({bids:[['99','0.5','1']],asks:[['101','1','1']]});
 if(url.includes('/ticker'))return Response.json({price:'100',bid:'99',ask:'101',volume:'1000',time:new Date().toISOString()});
 if(url.includes('coingecko'))return new Response('{}',{status:429});
 if(url.includes('geckoterminal'))return Response.json({data:[{id:'new_pool',attributes:{name:'NEW / ETH',base_token_price_usd:'0.01',reserve_in_usd:'1000'}}]});
 if(url.includes('finance.yahoo'))return Response.json({chart:{result:[{meta:{regularMarketPrice:123,regularMarketTime:Math.floor(Date.now()/1000),currency:'USD',exchangeDataDelayedBy:15}}]}});
 if(url.includes('bls.gov'))return new Response('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20300101T123000Z\r\nSUMMARY:Employment report\r\nEND:VEVENT\r\nEND:VCALENDAR');
 return Response.json({output:[{content:[{type:'output_text',text:'Test-only reply'}]}]});
};
const server=await createApp({env:{PREVIEW_PASSWORD:'test-only-password-not-real-secret',SESSION_SECRET:'test-only-session-secret-at-least-32-chars',AI_API_KEY:'test-only-key',AI_PROVIDER:'openai',AI_USAGE_MODE:'paid',MARKET_FEEDS_ENABLED:'true'},storage,fetchImpl});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
'''

class SeriousTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium')
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.process=subprocess.Popen(['node','--input-type=module','-e',RUNNER],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  self.url='http://127.0.0.1:'+str(json.loads(self.process.stdout.readline())['port'])
  self.contexts=[];self.errors=[]
 def tearDown(self):
  for c in self.contexts:c.close()
  self.process.terminate();self.process.communicate(timeout=5)
  self.assertEqual(self.errors,[])
 def login(self,seed=None,clock=False):
  context=self.browser.new_context();self.contexts.append(context)
  if seed:context.add_init_script("if(!localStorage.getItem('ponce-nova:v1'))localStorage.setItem('ponce-nova:v1',"+json.dumps(json.dumps(seed))+")")
  page=context.new_page();page.on('pageerror',lambda e:self.errors.append(str(e)))
  if clock:page.clock.install()
  page.goto(self.url);page.locator('input[name=password]').fill(PASSWORD);page.get_by_role('button',name='Logga in',exact=True).click()
  expect(page.locator('#coins')).to_contain_text('Bitcoin',timeout=20000)
  return page
 def send(self,page,message):
  page.locator('#message').fill(message);page.get_by_role('button',name='Skicka meddelande',exact=True).click()
 def test_cross_device_chat_and_conflict_preserves_unsaved_mobile_copy(self):
  a=self.login();b=self.login()
  self.send(a,'Datorns gemensamma notering')
  expect(a.locator('#storage-status')).to_contain_text('Sparad på servern')
  a.reload();expect(a.locator('#storage-status')).to_contain_text('Synkad med servern')
  self.send(b,'Mobilens osynkade notering')
  expect(b.locator('#storage-status')).to_contain_text('annan enhet')
  b.get_by_role('button',name='Lagring & synkning',exact=True).click()
  b.get_by_role('button',name='Hämta serverversion och bevara lokal kopia',exact=True).click()
  expect(b.locator('#messages')).to_contain_text('Datorns gemensamma notering')
  expect(b.locator('#messages')).not_to_contain_text('Mobilens osynkade notering')
  self.assertIn('Mobilens osynkade notering',b.evaluate("localStorage.getItem('ponce-nova:v1:before-shared-sync')"))
  with b.expect_download() as download:b.get_by_role('button',name='Ladda ned bevarad lokal kopia',exact=True).click()
  backup=json.loads(Path(download.value.path()).read_text())
  self.assertEqual(backup['format'],'ponce-nova-workspace-backup-v1')
  self.assertIn('Mobilens osynkade notering',json.dumps(backup,ensure_ascii=False))
  b.locator('#workspace-backup-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
  b.locator('#confirm-workspace-restore').check()
  b.get_by_role('button',name='Återställ vald backup',exact=True).click()
  expect(b.locator('#messages')).to_contain_text('Mobilens osynkade notering')
  expect(b.locator('#storage-status')).to_contain_text('Sparad på servern')
  c=self.login();expect(c.locator('#messages')).to_contain_text('Mobilens osynkade notering')
 def test_local_history_migration_requires_explicit_choice(self):
  state={'version':1,'ledger':[],'chats':{'shared':[{'author':'Du','text':'Bevara gamla chatten','time':1}],'agents':[]},'events':[]}
  page=self.login(state)
  expect(page.locator('#storage-status')).to_contain_text('Inga data har skrivits över')
  page.get_by_role('button',name='Lagring & synkning',exact=True).click()
  page.get_by_role('button',name='För över min lokala historik till tom databas',exact=True).click()
  expect(page.locator('#dialog-content')).to_contain_text('Sparad på servern')
  other=self.login();expect(other.locator('#messages')).to_contain_text('Bevara gamla chatten')
 def test_realistic_partial_fill_holdings_refresh_off_tab_and_monitoring(self):
  page=self.login(clock=True)
  expect(page.locator('#data-source')).to_contain_text('ingen börsvärdesrankning')
  page.get_by_role('button',name='Paper-order',exact=True).first.click()
  expect(page.locator('#trade-book')).to_be_checked()
  page.locator('#trade-quantity').fill('2')
  page.get_by_role('button',name='Bekräfta simulerad order',exact=True).click()
  expect(page.locator('.form-result')).to_contain_text('Delavslut')
  saved=page.evaluate("JSON.parse(localStorage.getItem('ponce-nova:v1'))")
  self.assertEqual(saved['ledger'][0]['quantity'],1)
  self.assertEqual(saved['ledger'][0]['remainingQuantity'],1)
  self.assertEqual(saved['ledger'][0]['source'],'Coinbase Exchange orderbok')
  page.keyboard.press('Escape');page.locator('[data-category="new"]').click()
  expect(page.locator('#coins')).to_contain_text('NEW / ETH')
  def snapshot(route):
   import time
   route.fulfill(json={'quotes':[{'id':'bitcoin','name':'Bitcoin','symbol':'BTC','price':150,'updated':time.time()*1000,'source':'Coinbase Exchange','tradable':True}],'missing':[],'received':time.time()*1000})
  page.route('**/api/snapshot?**',snapshot);page.clock.fast_forward(30001)
  expect(page.locator('#profit')).to_contain_text('48,85')
  expect(page.locator('#coins')).to_contain_text('NEW / ETH')
  page.get_by_role('button',name='Driftstatus',exact=True).click()
  expect(page.locator('#dialog-content')).to_contain_text('CoinGecko')
  page.keyboard.press('Escape')
  page.locator('[data-action="exchange"]').last.click()
  expect(page.locator('#dialog-content')).to_contain_text('inte spotpriset')
  page.keyboard.press('Escape');page.locator('[data-action="calendar"]').click()
  expect(page.locator('#dialog-content')).to_contain_text('Employment report')
  page.keyboard.press('Escape')
  for width in [320,390,768,1440]:
   page.set_viewport_size({'width':width,'height':900})
   self.assertEqual(page.evaluate('document.documentElement.scrollWidth'),width)

if __name__=='__main__':unittest.main(verbosity=2)
