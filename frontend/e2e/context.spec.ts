import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/#desktop=e2e-desktop-bootstrap-only')
  await expect(page.getByRole('heading',{name:'EM ESPERA'})).toBeVisible()
}
const city = {name:'Recife, Pernambuco, Brasil',latitude:-8.05,longitude:-34.88,timezone:'America/Recife'}
const weather = {temperature:28.4,feels_like:31,humidity:71,code:2,is_day:true,high:30,low:24,description:'Parcialmente nublado',timezone:'America/Recife',observed_at:'2026-10-24T10:00',fetched_at:'2026-10-24T13:00:00Z',source:'Open-Meteo'}

test('cidade escolhida, clima do provedor, relógio e remoção sem GPS automático', async ({page}) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(() => {
    ;(window as unknown as {gpsCalls:number}).gpsCalls=0
    navigator.geolocation.getCurrentPosition=()=>{(window as unknown as {gpsCalls:number}).gpsCalls++}
  })
  await page.route('**/api/environment/cities?*', route=>route.fulfill({json:[city]}))
  await page.route('**/api/environment/weather', async route=>{
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({latitude:-8.05,longitude:-34.88})
    await route.fulfill({json:weather})
  })
  await login(page)
  await expect(page.getByRole('button',{name:'Configurar localização'})).toContainText('Escolher cidade')
  await page.getByRole('button',{name:'Localização',exact:true}).click()
  await page.getByLabel('Buscar cidade').fill('Recife')
  await page.getByRole('button',{name:'Buscar',exact:true}).click()
  await page.getByRole('button',{name:city.name}).click()
  await expect(page.locator('.weather-reading')).toContainText('28')
  await expect(page.locator('.hud-weather')).toContainText('Parcialmente nublado')
  await expect(page.locator('.hud-clock')).toContainText('America/Recife')
  await expect(page.locator('.local-time')).toContainText(new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Recife',hour:'2-digit',minute:'2-digit'}))
  await page.reload()
  await expect(page.getByRole('button',{name:'Configurar localização'})).toContainText('Recife')
  expect(await page.evaluate(()=>(window as unknown as {gpsCalls:number}).gpsCalls)).toBe(0)
  await page.getByLabel('Mensagem para o Jarvis').fill('Que horas são?')
  await page.getByRole('button',{name:'Enviar mensagem'}).click()
  await expect(page.locator('.hud-answer')).toContainText('horas e')
  await expect(page.locator('.hud-answer')).toContainText('America/Recife')
  await page.getByRole('button',{name:'Localização',exact:true}).click()
  await page.getByRole('button',{name:'Remover localização'}).click()
  expect(await page.evaluate(()=>localStorage.getItem('jarvis-city'))).toBe(null)
  expect(errors).toEqual([])
})

test('localização negada e clima indisponível têm estados claros', async ({page}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition=(_success,failure)=>failure?.({code:1,message:'denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3})
  })
  await page.route('**/api/environment/cities?*',route=>route.fulfill({json:[city]}))
  await page.route('**/api/environment/weather',route=>route.fulfill({status:503,json:{detail:'Clima indisponível no teste.'}}))
  await login(page)
  await page.getByRole('button',{name:'Localização',exact:true}).click()
  await page.getByRole('button',{name:'Usar minha localização'}).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Permissão de localização negada')
  await page.getByLabel('Buscar cidade').fill('Recife')
  await page.getByRole('button',{name:'Buscar',exact:true}).click()
  await page.getByRole('button',{name:city.name}).click()
  await expect(page.locator('.weather-empty')).toContainText('Clima indisponível no teste.')
  await expect(page.locator('.weather-reading')).not.toBeVisible()
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/context-mobile.png',animations:'disabled'})
})

test('voz ativada lê respostas locais e interrompe a fila com callbacks antigos ignorados', async ({page}) => {
  // Stub explícito do navegador: valida integração/controle, sem alegar áudio físico.
  await page.addInitScript(() => {
    type StubUtterance = {text:string;onstart?:(e:Event)=>void;onend?:(e:Event)=>void}
    const events = new EventTarget(), state={texts:[] as string[],cancelled:0,last:null as StubUtterance|null}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class { text:string;constructor(text:string){this.text=text} }})
    Object.defineProperty(window,'__speechTest',{value:state})
    Object.defineProperty(window,'speechSynthesis',{value:{
      getVoices:()=>[{name:'Português teste',lang:'pt-BR'}],
      addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),
      resume:()=>{},cancel:()=>{state.cancelled++},speak:(u:StubUtterance)=>{state.texts.push(u.text);state.last=u;u.onstart?.(new Event('start'))},
    }})
  })
  await login(page)
  await page.getByRole('button',{name:'Ativar respostas por voz',exact:true}).last().click()
  await expect(page.locator('.hud-voice-toggle')).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'Interromper fala',exact:true}).last()).toBeVisible()
  await page.getByLabel('Mensagem para o Jarvis').fill('Que dia é hoje?')
  await page.getByRole('button',{name:'Enviar mensagem'}).click()
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__speechTest:{texts:string[]}}).__speechTest.texts.join(' '))).toContain('Hoje é')
  const longAnswer = 'Esta é uma resposta longa do teste de integração. '.repeat(16)
  await page.route('**/api/chat',route=>route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({type:'delta',text:longAnswer})}\n\ndata: {"type":"done"}\n\n`}))
  await page.getByLabel('Mensagem para o Jarvis').fill('Resposta longa de teste')
  await page.getByRole('button',{name:'Enviar mensagem'}).click()
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__speechTest:{texts:string[]}}).__speechTest.texts.at(-1))).toContain('resposta longa')
  const beforeNext=await page.evaluate(()=>{
    const state=(window as unknown as {__speechTest:{texts:string[];last:{onend?:(e:Event)=>void}}}).__speechTest
    const count=state.texts.length;state.last.onend?.(new Event('end'));return count
  })
  expect(await page.evaluate(()=>(window as unknown as {__speechTest:{texts:string[]}}).__speechTest.texts.length)).toBe(beforeNext+1)
  await page.getByRole('button',{name:'Interromper fala',exact:true}).last().click()
  await expect(page.locator('.floating-voice-stop')).not.toBeVisible()
  const count=await page.evaluate(()=>{
    const state=(window as unknown as {__speechTest:{texts:string[];last:{onend?:(e:Event)=>void};cancelled:number}}).__speechTest
    const count=state.texts.length;state.last.onend?.(new Event('end'));return count
  })
  expect(await page.evaluate(()=>(window as unknown as {__speechTest:{texts:string[]}}).__speechTest.texts.length)).toBe(count)
  await page.getByRole('button',{name:'Desativar respostas por voz'}).click()
  await page.unroute('**/api/chat')
  await page.getByLabel('Mensagem para o Jarvis').fill('que horas são?')
  await page.getByRole('button',{name:'Enviar mensagem'}).click()
  await expect(page.locator('.hud-answer')).toContainText('horas e')
  expect(await page.evaluate(()=>(window as unknown as {__speechTest:{texts:string[]}}).__speechTest.texts.length)).toBe(count)
})

test('GPS usa aproximação só após clique e não persiste coordenadas',async({page})=>{
  await page.addInitScript(()=>{
    const state={calls:0};Object.defineProperty(window,'__gpsTest',{value:state})
    navigator.geolocation.getCurrentPosition=success=>{
      state.calls++
      success({coords:{latitude:-8.051937,longitude:-34.881917,accuracy:100,altitude:null,altitudeAccuracy:null,heading:null,speed:null,toJSON:()=>({})},timestamp:Date.now(),toJSON:()=>({})})
    }
  })
  await page.route('**/api/environment/reverse',async route=>{
    expect(route.request().postDataJSON()).toEqual({latitude:-8.05,longitude:-34.88})
    await route.fulfill({json:city})
  })
  await page.route('**/api/environment/weather',route=>route.fulfill({json:weather}))
  await login(page)
  expect(await page.evaluate(()=>(window as unknown as {__gpsTest:{calls:number}}).__gpsTest.calls)).toBe(0)
  await page.getByRole('button',{name:'Localização',exact:true}).click()
  await expect(page.getByRole('dialog')).toContainText('uma posição aproximada é enviada')
  await page.getByRole('button',{name:'Usar minha localização'}).click()
  await expect(page.locator('.selected-place')).toContainText('Recife')
  expect(await page.evaluate(()=>localStorage.getItem('jarvis-city'))).toBe(null)
  await page.getByRole('button',{name:'Fechar diálogo'}).click()
  await expect(page.locator('.weather-reading')).toContainText('28')
  await page.getByRole('navigation').getByRole('button',{name:'Configurações'}).click()
  await page.getByRole('button',{name:'Bloquear núcleo'}).click()
  await page.getByLabel('Senha do proprietário').fill('e2e-password')
  await page.getByRole('button',{name:'Desbloquear núcleo'}).click()
  await expect(page.getByRole('button',{name:'Configurar localização'})).toContainText('Escolher cidade')
  await page.reload()
  await expect(page.getByRole('button',{name:'Configurar localização'})).toContainText('Escolher cidade')
  expect(await page.evaluate(()=>(window as unknown as {__gpsTest:{calls:number}}).__gpsTest.calls)).toBe(0)
})
