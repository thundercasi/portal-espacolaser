// =====================================================================
// Coleta do ELOS para o Funil Espaçolaser (roda na página do ELOS, logado,
// unidade "CASSIANO COLOMBO/RONNEY RAMON CÂNDIDO" = id 458).
//
// Usa as próprias tabelas (kendoGrid) dos relatórios abertos para fazer as
// requisições (dataSource.read) — sem clicar em BUSCA/EXCEL — e baixa UM arquivo
// "funil_elos_AAAAMMDD_HHMM.json" com as abas Leads, Agendamentos, Vendas e
// Cancelamentos, no formato que a tela Importar do Funil reconhece.
//
// Instalação (uma vez): localStorage.setItem('ccfunil', <conteúdo deste arquivo>)
// Uso:  eval(localStorage.getItem('ccfunil')); await CF.exportar()
//        → devolve um resumo curto (contagens) e baixa o arquivo.
// =====================================================================
window.CF = {
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  dd: (n) => String(n).padStart(2, '0'),
  data(d) { return `${CF.dd(d.getDate())}/${CF.dd(d.getMonth() + 1)}/${d.getFullYear()}` },
  dataHora(v) {
    if (v == null || v === '') return ''
    const d = v instanceof Date ? v : new Date(v)
    if (isNaN(d)) return String(v)
    return `${CF.data(d)} ${CF.dd(d.getHours())}:${CF.dd(d.getMinutes())}`
  },
  soData(v) { const s = CF.dataHora(v); return s.slice(0, 10) },

  /** frame do relatório pelo título "Rel. > ..." */
  frame(re) {
    for (let i = 0; i < window.frames.length; i++) {
      try {
        const f = window.frames[i], d = f.document
        if (!d.querySelector('#btnFilter')) continue
        const t = [...d.querySelectorAll('*')].map((x) => (x.childElementCount === 0 ? x.textContent.trim() : '')).find((s) => /^Rel\. >/.test(s)) || ''
        if (re.test(t)) return f
      } catch (e) { /* frame de outro domínio */ }
    }
    return null
  },

  async garantirUnidade() {
    const atual = document.querySelector('.multitabs-unit-node.current')?.dataset.id
    if (atual === '458') return
    const n = document.querySelector('.multitabs-unit-node[data-id="458"]')
    if (!n) throw new Error('UNIDADE_458_NAO_ENCONTRADA')
    n.click(); n.querySelector('.multitabs-unit-desc')?.click()
    await CF.esperar(7000)
    if (document.querySelector('.multitabs-unit-node.current')?.dataset.id !== '458') throw new Error('UNIDADE_NAO_TROCOU')
  },

  /** abre Relatórios e os 4 relatórios, se ainda não estiverem abertos */
  async abrirRelatorios() {
    const precisa = [['Leads', /Cliente > Leads/], ['Agendamentos', /Atendimento > Agendamentos/], ['Vendas', /Venda > Vendas/], ['Cancelamentos', /Venda > Cancelamentos/]]
    if (precisa.every(([, re]) => CF.frame(re))) return
    const menuLink = [...document.querySelectorAll('a')].find((x) => x.innerText.trim() === 'Relatórios')
    if (!menuLink) throw new Error('SEM_MENU_RELATORIOS (login?)')
    menuLink.click(); await CF.esperar(5000)
    let menu = null
    for (let i = 0; i < window.frames.length; i++) { try { if (window.frames[i].location.pathname.includes('ReportMain')) menu = window.frames[i] } catch (e) { /* */ } }
    if (!menu) throw new Error('SEM_FRAME_RELATORIOS')
    for (const [nome, re] of precisa) {
      if (CF.frame(re)) continue
      ;[...menu.document.querySelectorAll('a')].find((x) => x.innerText.trim() === nome)?.click()
      await CF.esperar(6000)
      if (!CF.frame(re)) throw new Error('NAO_ABRIU_' + nome)
    }
  },

  periodo(f, el, ini, fim) {
    const $ = f.$, dp = $(el).data('daterangepicker')
    dp.setStartDate(ini); dp.setEndDate(fim)
    $(el).val(`${ini} - ${fim}`).trigger('change')
  },
  dataInput(f, rotulo) {
    const $ = f.$
    const campos = [...f.document.querySelectorAll('input')].filter((e) => $(e).data('daterangepicker'))
    if (!rotulo) return campos[0]
    return campos.find((e) => (e.closest('.form-group, [class*=col-]')?.querySelector('label')?.innerText || '').includes(rotulo)) || null
  },
  detalhe(f, valores) { f.$('#cboDetailLevel').val(valores).trigger('change') },

  /** requisição do relatório pela própria tabela; devolve as linhas (objetos) */
  async ler(f) {
    const g = f.$(f.document.querySelector('.k-grid')).data('kendoGrid')
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('TEMPO_ESGOTADO')), 180000)
      g.dataSource.one('change', () => { clearTimeout(t); res() })
      g.dataSource.one('error', (e) => { clearTimeout(t); rej(new Error('ERRO_REQUISICAO ' + (e?.xhr?.status ?? ''))) })
      g.dataSource.read()
    })
    return g.dataSource.data().toJSON()
  },

  /**
   * Exporta. Período padrão: do dia 1º do mês até hoje; nos dias 1 a 3 também o mês anterior inteiro
   * (para fechar o mês com o que entrou atrasado). Agendamentos: data programada no(s) mês(es) inteiro(s)
   * + criados no período (duas requisições; o Funil remove repetidos).
   */
  async exportar(opcoes = {}) {
    const hoje = new Date()
    const iniMes = new Date(hoje.getFullYear(), hoje.getMonth() - (hoje.getDate() <= 3 ? 1 : 0), 1)
    const ini = opcoes.ini || CF.data(iniMes)
    const fim = opcoes.fim || CF.data(hoje)
    const fimMesAg = CF.data(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))
    await CF.garantirUnidade()
    await CF.abrirRelatorios()
    const abas = []
    const resumo = { periodo: `${ini} a ${fim}` }

    // ---------------- Leads ----------------
    {
      const f = CF.frame(/Cliente > Leads/)
      CF.periodo(f, CF.dataInput(f), ini, fim)
      const rows = await CF.ler(f)
      abas.push({ nome: 'Leads', linhas: [
        ['Data Cadastro', 'Id Lead', 'Estabelecimento', 'Atendente', 'Mídia', 'Status', 'Motivo do Descarte', 'É indicação?'],
        ...rows.map((r) => [CF.dataHora(r.CreationDate), r.IdLead, r.Establishment, r.atendente ?? '', r.midia ?? '', r.Status ?? '', r.DiscardReason ?? '', r.IsIndication ? 'Sim' : 'Não']),
      ] })
      resumo.leads = rows.length
    }

    // ---------------- Agendamentos (2 requisições) ----------------
    {
      const f = CF.frame(/Atendimento > Agendamentos/)
      const prog = CF.dataInput(f, 'Programada'), cria = CF.dataInput(f, 'Criação')
      if (!prog || !cria) throw new Error('AGENDAMENTOS_SEM_CAMPOS_DE_DATA')
      CF.detalhe(f, ['Establishment', 'Date', 'SchedulerDate', 'Status', 'CreateUser', 'Client'])
      f.$('#cboStatus').val([]).trigger('change')
      const longe = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return CF.data(d) }
      // a) data programada no período (até o fim do mês) — avaliações e presenças
      CF.periodo(f, prog, ini, fimMesAg); CF.periodo(f, cria, CF.data(new Date(hoje.getFullYear() - 1, 0, 1)), fim)
      const a = await CF.ler(f)
      // b) criados no período (qualquer data programada) — agendamentos criados por atendente
      CF.periodo(f, cria, ini, fim); CF.periodo(f, prog, CF.data(new Date(hoje.getFullYear() - 1, 0, 1)), longe(180))
      const b = await CF.ler(f)
      const linha = (r) => [r.Establishment, CF.soData(r.Date), CF.soData(r.SchedulerDate), r.Client ?? '', r.ClientPhone ?? '', r.CreateUser ?? '', r.MediaTypeCli ?? '', r.StatusDescription ?? '', r.Quantity ?? 1]
      abas.push({ nome: 'Agendamentos', linhas: [
        ['Estabelecimento', 'Data Agendada', 'Data de Criação', 'Cliente', 'Telefone', 'Usuário de Criação', 'Origem Cliente', 'Status', 'Quantidade'],
        ...a.map(linha), ...b.map(linha),
      ] })
      resumo.agendamentos = `${a.length} programados + ${b.length} criados`
    }

    // ---------------- Vendas ----------------
    {
      const f = CF.frame(/Venda > Vendas/)
      CF.detalhe(f, ['Date', 'Establishment', 'Salesman', 'Contract'])
      CF.periodo(f, CF.dataInput(f), ini, fim)
      const rows = await CF.ler(f)
      abas.push({ nome: 'Vendas', linhas: [
        ['ID Orç.', 'Data de Pagamento', 'Estabelecimento', 'Vendedor', 'Origem Mídia', 'Tipo', 'Contrato Assinado', 'V. Bruto', 'V. Desconto', 'V. Líquido'],
        ...rows.map((r) => [r.BudgetId, CF.soData(r.FormattedDate ?? r.Date), r.Establishment, r.Salesman ?? '', r.MediaType ?? '', r.Type ?? '', r.SignedContract ?? '', r.GrossValue ?? 0, r.DiscountValue ?? 0, r.NetValue ?? 0]),
      ] })
      // mesma informação somada por unidade + vendedor + dia: alimenta as Premiações (vendas por vendedor)
      const pv = new Map()
      for (const r of rows) {
        const dia = CF.soData(r.FormattedDate ?? r.Date)
        const k = [r.Establishment, r.Salesman ?? '', dia].join('|')
        const t = pv.get(k) ?? [r.Establishment, r.Salesman ?? '', dia, 0, 0, 0]
        t[3] += Number(r.GrossValue || 0); t[4] += Number(r.DiscountValue || 0); t[5] += Number(r.NetValue || 0)
        pv.set(k, t)
      }
      abas.push({ nome: 'Vendas por vendedor', linhas: [['Estabelecimento', 'Vendedor', 'Data de Pagamento', 'V. Bruto', 'V. Desconto', 'V. Líquido'], ...pv.values()] })
      resumo.vendas = rows.length
      resumo.vendasLiquido = Math.round(rows.reduce((s, r) => s + Number(r.NetValue || 0), 0) * 100) / 100
    }

    // ---------------- Cancelamentos ----------------
    {
      const f = CF.frame(/Venda > Cancelamentos/)
      CF.periodo(f, CF.dataInput(f), ini, fim)
      const rows = await CF.ler(f)
      abas.push({ nome: 'Cancelamentos', linhas: [
        ['Orçamento', 'Item', 'Status', 'Data Cancelamento', 'Data Venda', 'Valor Cancelado', 'Valor Total', 'Estabelecimento Venda', 'Nome do Vendedor', 'Usuário Canc.', 'Motivo Cancelamento'],
        ...rows.map((r) => [r.Code, r.Item ?? '', r.BudgetStatus ?? '', CF.dataHora(r.CancelationDate), CF.soData(r.PaymentDate), r.ConcretizedNetValue ?? 0, r.TotalValue ?? 0, r.Establishment, r.Salesman ?? '', r.CancelationUser ?? '', r.CancelReason ?? '']),
      ] })
      resumo.cancelamentos = rows.length
    }

    // ---------------- um único arquivo ----------------
    const agora = new Date()
    const nome = `funil_elos_${agora.getFullYear()}${CF.dd(agora.getMonth() + 1)}${CF.dd(agora.getDate())}_${CF.dd(agora.getHours())}${CF.dd(agora.getMinutes())}.json`
    const blob = new Blob([JSON.stringify({ origem: 'ELOS', geradoEm: agora.toISOString(), periodo: [ini, fim], abas })], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome })
    document.body.appendChild(a); a.click(); a.remove()
    resumo.arquivo = nome
    return resumo
  },
}
