"""The simple agent page, using explicit model stubs and failing data dependencies."""
import json
from pathlib import Path
import subprocess
import unittest
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
PASSWORD='test-only-password-not-real-secret'
RUNNER=r'''
import {createApp} from './server/app.js';
const storage={configured:true,read:async()=>{throw new Error('Database must not be read by agent room')},write:async()=>{throw new Error('Database must not be written by agent room')},status:()=>({configured:true,healthy:false})};
const server=await createApp({env:{PREVIEW_PASSWORD:'test-only-password-not-real-secret',SESSION_SECRET:'test-only-session-secret-at-least-32-chars',AI_API_KEY:'test-only-model-key',AI_PROVIDER:'openai',AI_USAGE_MODE:'paid',MARKET_FEEDS_ENABLED:'true'},storage,fetchImpl:async(url,options)=>{
 if(!url.endsWith('/responses'))throw new Error('No market feed is available in this test');
 const input=JSON.parse(JSON.parse(options.body).input);
 if(input.message==='testa fel')return new Response('{}',{status:503});
 return Response.json({output:[{content:[{type:'output_text',text:'TEST-ONLY AI-svar: '+input.message}]}]});
}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
'''

class AgentRoomTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.process=subprocess.Popen(['node','--input-type=module','-e',RUNNER],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  info=json.loads(cls.process.stdout.readline());cls.url='http://127.0.0.1:'+str(info['port'])
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium')
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop();cls.process.terminate();cls.process.communicate(timeout=5)
 def setUp(self):
  self.context=self.browser.new_context();self.page=self.context.new_page();self.errors=[];self.requests=[];self.posts=[]
  self.page.on('pageerror',lambda e:self.errors.append(str(e)))
  def request(r):
   self.requests.append(r.url)
   if r.url.endswith('/api/agents/run'):self.posts.append(r.post_data_json)
  self.page.on('request',request)
 def tearDown(self):
  self.context.close();self.assertEqual(self.errors,[])
  self.assertFalse(any(any(path in u for path in ['/api/state','/api/market/','/api/snapshot','/api/overview','/api/calendar']) for u in self.requests))
 def login(self):
  self.page.goto(self.url+'/agents')
  expect(self.page).to_have_url(self.url+'/login?next=agents')
  self.page.locator('input[name=password]').fill(PASSWORD);self.page.get_by_role('button',name='Logga in',exact=True).click()
  expect(self.page).to_have_url(self.url+'/agents')
  expect(self.page.locator('#connection-status')).to_contain_text('testserver ansluten',timeout=20000)
 def test_roles_context_storage_and_responsive_layout(self):
  self.login();expect(self.page.locator('#agent-list button')).to_have_count(7)
  self.page.locator('[data-agent=nova]').click();self.page.locator('#question').fill('Min teststrategi heter Blå Fyr')
  self.page.locator('#send').click();expect(self.page.locator('#messages')).to_contain_text('TEST-ONLY AI-svar')
  expect(self.page.locator('#send')).to_be_enabled()
  self.page.locator('#question').fill('Vad sa jag?');self.page.locator('#send').click()
  expect(self.page.locator('#messages .message')).to_have_count(4)
  self.assertEqual(self.posts[1]['contextMode'],'agent-lab')
  self.assertIn('Blå Fyr',json.dumps(self.posts[1]['history'],ensure_ascii=False))
  self.assertNotIn('portfolio',self.posts[1])
  self.page.reload();self.page.locator('[data-agent=nova]').click();expect(self.page.locator('#messages')).to_contain_text('Blå Fyr')
  self.assertIsNone(self.page.evaluate("localStorage.getItem('ponce-nova:v1')"))
  for width in [320,390,768,1440]:
   self.page.set_viewport_size({'width':width,'height':900});self.assertEqual(self.page.evaluate('document.documentElement.scrollWidth'),width)
 def test_group_calls_all_seven_once(self):
  self.login();self.page.locator('#question').fill('Bidra kort inom din roll');self.page.locator('#ask-all').click()
  expect(self.page.locator('#messages .message-heading strong').filter(has_text='· AI')).to_have_count(7,timeout=20000)
  self.assertEqual([p['agentId'] for p in self.posts],['ponce','nova','analysis','trading','risk','technology','development'])
 def test_group_can_stop_and_unsent_draft_survives_cooldown(self):
  self.page.clock.install();self.page.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=60))
  def config(route):
   response=route.fetch();data=response.json();data['minimumIntervalMs']=30000;route.fulfill(response=response,json=data)
  self.page.route('**/api/config',config)
  self.login();self.page.locator('#question').fill('Ett grupp-test');self.page.locator('#ask-all').click()
  expect(self.page.locator('#activity')).to_contain_text('Paus före')
  self.page.locator('#stop').click();expect(self.page.locator('#stop')).to_be_hidden()
  self.page.locator('#question').fill('Behåll mitt utkast');self.page.locator('#question-form').evaluate('f=>f.requestSubmit()')
  expect(self.page.locator('#question')).to_have_value('Behåll mitt utkast')
  self.page.clock.fast_forward(31000);expect(self.page.locator('#send')).to_be_enabled()
  self.assertEqual(len(self.posts),1)
 def test_errors_are_not_fake_agent_replies_and_text_is_safe(self):
  self.login();self.page.locator('#question').fill('<img src=x onerror=alert(1)>');self.page.locator('#send').click()
  expect(self.page.locator('#messages')).to_contain_text('TEST-ONLY AI-svar');self.assertEqual(self.page.locator('#messages img').count(),0)
  self.page.locator('#question').fill('testa fel');self.page.locator('#send').click()
  expect(self.page.locator('#messages .error')).to_contain_text('överbelastad')
  expect(self.page.locator('#messages .message-heading strong').filter(has_text='· AI')).to_have_count(1)

if __name__=='__main__':unittest.main(verbosity=2)
