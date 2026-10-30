"use strict";
const $ = (id) => document.getElementById(id);
const cfg =
  window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_URL.startsWith("COLE_") &&
  !window.SUPABASE_ANON_KEY.startsWith("COLE_");
if (!cfg) $("setup").hidden = false;
let session = null,
  pedidos = [],
  atual = null;
const tokenKey = "comprafacil_aluno_token";
let alunoToken = localStorage.getItem(tokenKey);
if (!alunoToken) {
  alunoToken = crypto.randomUUID();
  localStorage.setItem(tokenKey, alunoToken);
}
$("nome").value = localStorage.getItem("comprafacil_aluno_nome") || "";
function msg(t) {
  $("msg").textContent = t;
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function reais(v) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
async function api(path, { method = "GET", body, admin = false } = {}) {
  if (!cfg) throw Error("Configure o Supabase no arquivo config.js.");
  const headers = {
    apikey: window.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Authorization:
      "Bearer " +
      (admin && session ? session.access_token : window.SUPABASE_ANON_KEY),
  };
  const response = await fetch(window.SUPABASE_URL.replace(/\/$/, "") + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok)
    throw Error(
      data?.message ||
        data?.error_description ||
        data?.error ||
        `Erro HTTP ${response.status}`,
    );
  return data;
}
async function rpc(name, data) {
  return api("/rest/v1/rpc/" + name, { method: "POST", body: data });
}
async function executar(fn) {
  try {
    msg("Carregando...");
    await fn();
    msg("");
  } catch (e) {
    msg("Erro: " + e.message);
  }
}
function tab(nome) {
  for (const n of ["aluno", "admin"]) $(n).hidden = n !== nome;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.tab === nome));
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
$("ver").onclick = () =>
  executar(async () => {
    const nome = $("nome").value.trim();
    if (nome.length < 3) throw Error("Informe seu nome completo.");
    localStorage.setItem("comprafacil_aluno_nome", nome);
    pedidos = await rpc("listar_solicitacoes", {});
    $("lista").hidden = false;
    $("cotacao").hidden = true;
    $("relatorio").hidden = true;
    renderPedidos();
  });
function renderPedidos() {
  $("pedidos").innerHTML = pedidos.length
    ? pedidos
        .map(
          (p) =>
            `<div class="item"><div><b>${esc(p.produto)}</b><p>Setor: ${esc(p.setor)} · Quantidade: ${p.quantidade}</p><small>${esc(p.justificativa)}</small></div><button data-id="${p.id}">Analisar / cotar</button></div>`,
        )
        .join("")
    : "Nenhuma solicitação disponível.";
  $("pedidos")
    .querySelectorAll("[data-id]")
    .forEach((b) => (b.onclick = () => abrir(b.dataset.id)));
}
function abrir(id) {
  atual = pedidos.find((p) => p.id === id);
  if (!atual) return;
  $("descricao").textContent =
    `${atual.produto} — ${atual.quantidade} unidade(s). ${atual.justificativa}`;
  $("fornecedores").innerHTML = [1, 2, 3]
    .map(
      (i) =>
        `<div class="quote"><h3>Fornecedor ${i}</h3><div class="cols"><label>Nome do fornecedor<input name="fornecedor${i}" maxlength="120" required></label><label>Preço unitário (R$)<input name="preco${i}" type="number" min="0.01" step="0.01" required></label><label>Frete (R$)<input name="frete${i}" type="number" min="0" step="0.01" value="0" required></label><label>Prazo (dias)<input name="prazo${i}" type="number" min="0" step="1" required></label></div></div>`,
    )
    .join("");
  $("cotacao").hidden = false;
  $("relatorio").hidden = true;
  $("cotacao").scrollIntoView({ behavior: "smooth" });
}
$("formCot").onsubmit = (e) => {
  e.preventDefault();
  executar(async () => {
    const f = new FormData(e.target),
      cotacoes = [1, 2, 3].map((i) => ({
        nome: String(f.get("fornecedor" + i)).trim(),
        preco: Number(f.get("preco" + i)),
        frete: Number(f.get("frete" + i)),
        prazo: Number(f.get("prazo" + i)),
      }));
    if (new Set(cotacoes.map((x) => x.nome.toLowerCase())).size !== 3)
      throw Error("Informe três fornecedores diferentes.");
    const rel = await rpc("registrar_cotacoes", {
      p_solicitacao: atual.id,
      p_token: alunoToken,
      p_nome: $("nome").value.trim(),
      p_cotacoes: cotacoes,
    });
    renderRelatorio(rel);
    $("relatorio").hidden = false;
    $("relatorio").scrollIntoView({ behavior: "smooth" });
  });
};
function renderRelatorio(rel) {
  const lista = rel.ranking;
  const vencedor = lista[0];
  $("resultado").innerHTML =
    `<p><b>Aluno:</b> ${esc(rel.aluno)} · <b>Produto:</b> ${esc(rel.produto)} · <b>Quantidade:</b> ${rel.quantidade}</p><div class="winner"><b>Melhor opção pelo menor custo: ${esc(vencedor.nome)}</b><p>Custo total: ${reais(vencedor.total)} · Entrega: ${vencedor.prazo} dias</p><p>Economia em relação à proposta mais cara: <b>${reais(rel.economia)}</b></p></div><div class="scroll"><table><thead><tr><th>Posição</th><th>Fornecedor</th><th>Preço unitário</th><th>Frete</th><th>Prazo</th><th>Total</th></tr></thead><tbody>${lista.map((c, i) => `<tr><td>${i + 1}º</td><td>${esc(c.nome)}</td><td>${reais(c.preco)}</td><td>${reais(c.frete)}</td><td>${c.prazo} dias</td><td>${reais(c.total)}</td></tr>`).join("")}</tbody></table></div><p><small>Critério: quantidade × preço unitário + frete. Empate: menor prazo. Não avalia qualidade ou garantia.</small></p>`;
}
$("print").onclick = () => window.print();
$("login").onsubmit = (e) => {
  e.preventDefault();
  executar(async () => {
    const data = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: $("email").value, password: $("senha").value },
    });
    session = data;
    try {
      await carregarAdmin();
    } catch (err) {
      session = null;
      throw Error(
        "Conta sem permissão de administrador ou falha de acesso: " +
          err.message,
      );
    }
    $("loginBox").hidden = true;
    $("adminBox").hidden = false;
    $("logout").hidden = false;
    $("senha").value = "";
  });
};
async function carregarAdmin() {
  const data = await api(
    "/rest/v1/solicitacoes?select=*&order=criado_em.desc",
    { admin: true },
  );
  $("adminPedidos").innerHTML = data.length
    ? data
        .map(
          (p) =>
            `<div class="item"><div><b>${esc(p.produto)}</b> (${p.quantidade})<p>${esc(p.setor)} · ${esc(p.responsavel)}</p><small>${esc(p.justificativa)}</small></div><button class="danger" data-del="${p.id}">Excluir</button></div>`,
        )
        .join("")
    : "Nenhuma solicitação cadastrada.";
  $("adminPedidos")
    .querySelectorAll("[data-del]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (
            confirm("Excluir esta solicitação e todas as cotações associadas?")
          )
            executar(async () => {
              await api(
                "/rest/v1/solicitacoes?id=eq." +
                  encodeURIComponent(b.dataset.del),
                { method: "DELETE", admin: true },
              );
              await carregarAdmin();
            });
        }),
    );
}
$("formPedido").onsubmit = (e) => {
  e.preventDefault();
  executar(async () => {
    const f = new FormData(e.target);
    await api("/rest/v1/solicitacoes", {
      method: "POST",
      admin: true,
      body: {
        produto: String(f.get("produto")).trim(),
        quantidade: Number(f.get("quantidade")),
        setor: String(f.get("setor")).trim(),
        responsavel: String(f.get("responsavel")).trim(),
        justificativa: String(f.get("justificativa")).trim(),
      },
    });
    e.target.reset();
    await carregarAdmin();
    msg("Solicitação cadastrada!");
  });
};
$("atualizar").onclick = () =>
  executar(async () => {
    const data = await api(
      "/rest/v1/cotacoes?select=aluno_nome,criado_em,solicitacoes(produto),ranking&order=criado_em.desc",
      { admin: true },
    );
    $("atividade").innerHTML = data.length
      ? `<div class="scroll"><table><thead><tr><th>Aluno</th><th>Solicitação</th><th>Melhor fornecedor</th><th>Data</th></tr></thead><tbody>${data.map((x) => `<tr><td>${esc(x.aluno_nome)}</td><td>${esc(x.solicitacoes?.produto)}</td><td>${esc(x.ranking?.[0]?.nome)}</td><td>${new Date(x.criado_em).toLocaleString("pt-BR")}</td></tr>`).join("")}</tbody></table></div>`
      : "Ainda não há cotações.";
  });
$("logout").onclick = () => {
  session = null;
  $("adminBox").hidden = true;
  $("loginBox").hidden = false;
  $("logout").hidden = true;
  tab("aluno");
};
