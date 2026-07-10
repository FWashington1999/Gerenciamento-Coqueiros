-- ============================================================
--  Banco de dados do sistema "Gestão da Plantação — Coqueiros"
--  Cole TODO este conteúdo no Supabase:
--    Painel do projeto  ->  SQL Editor  ->  New query  ->  colar  ->  Run
-- ============================================================

-- 1) Tabela dos lançamentos
create table if not exists public.transactions (
  id          bigint primary key,
  type        text not null,          -- 'entrada' | 'saida' | 'imprevisto'
  value       numeric not null,       -- valor em R$
  date        date not null,          -- data do lançamento (AAAA-MM-DD)
  qty         text,                   -- quantidade de cocos (opcional)
  description text,                   -- descrição
  category    text,                   -- categoria
  payment     text,                   -- forma de pagamento
  created_at  timestamptz default now()
);

-- 2) Liga a "trava de segurança" (Row Level Security).
--    Sem isso, qualquer um com a chave pública leria os dados.
alter table public.transactions enable row level security;

-- 3) Permite ler/gravar apenas para quem está LOGADO (conta da família).
--    Como você vai DESLIGAR o cadastro público (passo do GUIA.md),
--    só a conta da família consegue logar -> só ela acessa os dados.
drop policy if exists "acesso da familia" on public.transactions;
create policy "acesso da familia"
  on public.transactions
  for all
  to authenticated
  using (true)
  with check (true);
