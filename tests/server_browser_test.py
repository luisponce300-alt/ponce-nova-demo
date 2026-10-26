"""Full login/dashboard/server integration with explicit test-only AI and market transport."""
import json
from pathlib import Path
import subprocess
import unittest
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
PASSWORD='test-only-password-not-real-secret'
RUNNER=r'''
import {createApp}from './server/app.js';
const server=await createApp({env:{PREVIEW_PASSWORD:'test-only-password-not-real-secret',SESSION_SECRET:'test-only-session-secret-at-least-32-chars',AI_API_KEY:'test-only-ai-key',AI_PROVIDER:'openai',AI_USAGE_MODE:'paid'},fetchImpl:async(url,options)=>new Response(JSON.stringify(url.includes('/responses')?{output:[{content:[{type:'output_text',text:'Test-only response: no order has been placed.'}]}]}:[{id:'bitcoin',name:'Bitcoin',symbol:'btc',current_price:100,price_change_percentage_24h:3,market_cap:1000000,last_updated:new Date().toISOString()}]))});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
'''
class ServerBrowserTests(unittest.TestCase):
 RUNNER=RUNNER
 @classmethod
 def setUpClass(cls):
  cls.process=subprocess.Popen(['node','--input-type=module','-e',cls.RUNNER],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  info=json.loads(cls.process.stdout.readline());cls.url=f'http://127.0.0.1:{info["port"]}'
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium')
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop();cls.process.terminate();cls.process.communicate(timeout=5)
 def setUp(self):
  self.context=self.browser.new_context();self.page=self.context.new_page();self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)))
 def tearDown(self):
  self.context.close();self.assertEqual(self.errors,[])
 def login(self):
  self.page.goto(self.url);expect(self.page).to_have_url(self.url+'/login')
  self.page.locator('input[name=password]').fill(PASSWORD);self.page.get_by_role('button',name='Logga in',exact=True).click()
  expect(self.page.locator('#runtime-status')).to_contain_text('AI konfigurerad')
  expect(self.page.locator('#coins')).to_contain_text('Bitcoin')
 def test_private_login_ai_response_and_paper_state(self):
  self.login()
  self.page.get_by_role('button',name='Alla agenter',exact=True).click()
  expect(self.page.locator('.agent-directory article')).to_have_count(7)
  self.page.keyboard.press('Escape')
  self.page.locator('#use-ai').check();self.page.locator('#chat-agent').select_option('nova')
  self.page.locator('#message').fill('Granska underlaget')
  self.page.get_by_role('button',name='Skicka meddelande',exact=True).click()
  expect(self.page.locator('#messages')).to_contain_text('Nova · AI-svar')
  expect(self.page.locator('#messages')).to_contain_text('Test-only response')
  expect(self.page.locator('#trade-count')).to_have_text('0')
  self.page.reload();expect(self.page.locator('#messages')).to_contain_text('Nova · AI-svar')
  self.page.locator('#logout button').click();expect(self.page).to_have_url(self.url+'/login')
  self.page.goto(self.url);expect(self.page).to_have_url(self.url+'/login')
 def test_board_calls_all_seven_only_after_explicit_button(self):
  self.login();self.page.locator('[data-action="board"]').first.click()
  expect(self.page.locator('#messages')).not_to_contain_text('AI-svar')
  self.page.get_by_role('button',name='Begär AI-genomgång från alla sju roller',exact=True).click()
  expect(self.page.locator('#messages')).to_contain_text('Utveckling · AI-svar',timeout=15000)
  self.assertEqual(self.page.locator('#messages .message-heading').filter(has_text='AI-svar').count(),7)
  expect(self.page.locator('#trade-count')).to_have_text('0')
 def test_mobile_server_controls_fit(self):
  self.login()
  for width in [320,390,768,1440]:
   self.page.set_viewport_size({'width':width,'height':900})
   self.assertEqual(self.page.evaluate('document.documentElement.scrollWidth'),width)

class GeminiServerBrowserTests(ServerBrowserTests):
 RUNNER=RUNNER.replace("AI_API_KEY:'test-only-ai-key',AI_PROVIDER:'openai',AI_USAGE_MODE:'paid'", "GEMINI_API_KEY:'test-only-gemini-key',AI_PROVIDER:'gemini',AI_USAGE_MODE:'free-test',GEMINI_FREE_TIER_CONFIRMED:'true',AI_MIN_INTERVAL_SECONDS:'0'").replace("url.includes('/responses')", "url.includes(':generateContent')").replace("{output:[{content:[{type:'output_text',text:'Test-only response: no order has been placed.'}]}]}", "{candidates:[{finishReason:'STOP',content:{parts:[{text:'Test-only response: no order has been placed.'}]}}]}")
 def test_provider_label_and_paced_board_can_be_cancelled(self):
  self.page.clock.install()
  def configure(route):
   response=route.fetch();data=response.json();data['minimumIntervalMs']=30000;route.fulfill(response=response,json=data)
  self.page.route('**/api/config',configure)
  self.login();expect(self.page.locator('#ai-provider-name')).to_have_text('Google Gemini')
  self.page.locator('[data-action="board"]').first.click()
  self.page.get_by_role('button',name='Begär AI-genomgång från alla sju roller',exact=True).click()
  expect(self.page.locator('#ai-status')).to_contain_text('Paus för testkvoten')
  self.page.locator('#cancel-board').click()
  self.page.clock.fast_forward(60000)
  expect(self.page.locator('#ai-status')).to_contain_text('avbrutet')
  self.assertEqual(self.page.locator('#messages .message-heading').filter(has_text='AI-svar').count(),1)

if __name__=='__main__':unittest.main(verbosity=2)
