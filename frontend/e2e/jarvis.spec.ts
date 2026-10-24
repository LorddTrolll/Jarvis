import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/#desktop=e2e-desktop-bootstrap-only')
  await expect(page.getByRole('heading', { name: 'EM ESPERA' })).toBeVisible()
  await page.request.delete('/api/data', { headers: { 'X-Jarvis-Confirm': 'DELETE' } })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'EM ESPERA' })).toBeVisible()
})

test('tarefas, conversa, documentos e revisão sem falsos envios', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.getByRole('navigation').getByRole('button', { name: 'Agenda e tarefas' }).click()
  const title = `Revisar projeto ${Date.now()}`
  await page.getByLabel('O que precisa ser feito?').fill(title)
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(page.locator('.tasks-list')).toContainText(title)
  await page.locator('.tasks-list').getByRole('button', { name: `Concluir ${title}` }).click()
  await expect(page.locator('.tasks-list .task-row.done')).toContainText(title)
  await page.getByRole('navigation').getByRole('button', { name: 'Conversar com Jarvis' }).click()
  await page.getByLabel('Mensagem para o Jarvis').fill('crie tarefa Teste por conversa')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await expect(page.locator('.chat-messages')).toContainText('Tarefa criada: Teste por conversa.')
  await page.getByRole('navigation').getByRole('button', { name: 'Arquivos e memória' }).click()
  await page.getByLabel('Importar documento').setInputFiles({ name: 'memoria.txt', mimeType: 'text/plain', buffer: Buffer.from('Jarvis reconhece gestos de pinça com processamento local.') })
  await expect(page.locator('.document-list')).toContainText('memoria.txt')
  await page.getByLabel('Buscar nos documentos').fill('processamento')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.locator('.file-excerpt').first()).toContainText('processamento local')
  await page.getByRole('navigation').getByRole('button', { name: 'Conexões', exact: true }).click()
  await page.getByLabel('ID numérico da conversa').fill('123456')
  await page.getByLabel('Mensagem', { exact: true }).fill('Uma mensagem que não será enviada sem credenciais.')
  await page.getByRole('button', { name: 'Criar rascunho' }).click()
  await page.getByRole('button', { name: 'Revisar mensagem' }).first().click()
  await expect(page.getByRole('button', { name: 'Confirmar e enviar mensagem' })).toBeDisabled()
  await page.getByLabel('Conferi o destinatário').check()
  await page.getByRole('button', { name: 'Confirmar e enviar mensagem' }).click()
  await expect(page.getByRole('alert')).toContainText('Configure JARVIS_TELEGRAM_TOKEN')
  expect(errors).toEqual([])
})

test('MediaPipe carrega pesos e WASM locais com webcam sintética e encerra tracks', async ({ page }) => {
  const requests: string[] = []
  page.on('request', r => requests.push(r.url()))
  await page.getByRole('navigation').getByRole('button', { name: 'Visão e gestos' }).click()
  await page.getByRole('button', { name: 'Ativar câmera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Desligar câmera', exact: true })).toBeVisible({ timeout: 45000 })
  await expect(page.locator('.camera-info')).toContainText(/\d+ FPS/)
  await expect.poll(async () => page.locator('.camera-info').innerText()).not.toContain('0 FPS')
  expect(requests.some(url => url.includes('/models/hand_landmarker.task'))).toBe(true)
  expect(requests.some(url => url.endsWith('.wasm'))).toBe(true)
  expect(requests.every(url => url.startsWith('http://127.0.0.1:5173/') || url.startsWith('blob:'))).toBe(true)
  await page.getByRole('button', { name: 'Desligar câmera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ativar câmera', exact: true })).toBeVisible()
  expect(await page.locator('video').evaluate(video => video.srcObject)).toBe(null)
})

test('pinça seleciona navegação real e não alcança ações sensíveis', async ({ page }) => {
  // Quadros sintéticos atravessam o reconhecedor e o despachante reais até a navegação no DOM.
  const taskButton = page.getByRole('navigation').getByRole('button', { name: 'Agenda e tarefas' })
  const box = (await taskButton.boundingBox())!
  const clicked = await page.evaluate(async ({ x, y }) => {
    const { GestureEngine } = await import('/src/gestures/engine.ts')
    const { clickFromGesture } = await import('/src/gestures/dispatch.ts')
    const target = { x: x / innerWidth, y: y / innerHeight }
    const makeHand = (kind: string) => {
      const points = Array.from({ length: 21 }, () => ({ x: .5, y: .6 }))
      points[0] = { x: .5, y: .9 }; points[4] = { x: .24, y: .64 }
      for (const [i,base] of [5,9,13,17].entries()) {
        const px = .38 + i * .11
        points[base] = { x: px, y: .63 }; points[base+1] = { x: px, y: .5 }
        points[base+2] = { x: px, y: .4 }
        points[base+3] = { x: px, y: kind === 'open' || kind === 'point' && i === 0 || kind === 'pinch' && i > 0 ? .25 : .73 }
      }
      if (kind === 'pinch') { points[8] = { x: .31, y: .52 }; points[4] = { x: .29, y: .52 } }
      const offset = { x: 1 - target.x - points[8].x, y: target.y - points[8].y }
      return points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))
    }
    const engine = new GestureEngine({ smoothing: 1 })
    engine.update([makeHand('open')],0); engine.update([makeHand('open')],200)
    engine.update([makeHand('pinch')],250); engine.update([makeHand('pinch')],450)
    const release = engine.update([makeHand('point')],550)
    return release.actions.includes('click') && release.cursor && clickFromGesture(release.cursor)
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  expect(clicked).toBe(true)
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'Conexões', exact: true }).click()
  await page.getByLabel('ID numérico da conversa').fill('123456')
  await page.getByLabel('Mensagem', { exact: true }).fill('Rascunho para testar bloqueio de gestos.')
  await page.getByRole('button', { name: 'Criar rascunho' }).click()
  const reviewButton = page.getByRole('button', { name: 'Revisar mensagem' }).first()
  const sensitiveBox = (await reviewButton.boundingBox())!
  const selected = await page.evaluate(async ({ x, y }) => {
    const module = await import('/src/gestures/dispatch.ts')
    return module.clickFromGesture({ x: x / innerWidth, y: y / innerHeight })
  }, { x: sensitiveBox.x + sensitiveBox.width / 2, y: sensitiveBox.y + sensitiveBox.height / 2 })
  expect(selected).toBe(false)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('painel responsivo mantém navegação e controles acessíveis', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('navigation').getByRole('button', { name: 'Visão e gestos' }).click()
  await expect(page.getByRole('heading', { name: 'Visão e gestos' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/jarvis-mobile.png', fullPage: true, animations: 'disabled' })
})

test('captura do dashboard sem dados demonstrativos', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(page.getByTestId('neural-stage')).toBeVisible()
  await expect.poll(async()=>parseInt(await page.getByLabel('FPS do cenário').innerText())).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/jarvis-dashboard.png', fullPage: true, animations: 'disabled' })
})

test('câmera negada informa erro e mantém o assistente disponível', async ({ page }) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Negado', 'NotAllowedError') }
  })
  await page.getByRole('navigation').getByRole('button', { name: 'Visão e gestos' }).click()
  await page.getByRole('button', { name: 'Ativar câmera', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Permissão de câmera negada')
  await expect(page.getByRole('button', { name: 'Ativar câmera', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Voltar ao núcleo', exact:true }).click()
  await page.getByRole('button', { name: 'Falar com Jarvis' }).click()
  await expect(page.getByRole('dialog')).toContainText('o áudio pode ser enviado')
  await page.getByRole('button', { name: 'Fechar diálogo' }).click()
})
