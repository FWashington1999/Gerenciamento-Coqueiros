-- Tabela dos lançamentos
create table if not exists public.transactions (
  id           bigint primary key,
  type         text not null,         -- 'entrada' | 'saida' | 'imprevisto'
  value        numeric not null,      -- valor em R$
  date         date not null,         -- data do lançamento (AAAA-MM-DD)
  qty          text,                  -- quantidade de cocos (opcional)
  description  text,                  -- descrição
  category     text,                  -- categoria
  payment      text,                  -- forma de pagamento
  unit_value   numeric,               -- valor por coco (R$) (opcional)
  receipt_path text,                  -- caminho do comprovante em PDF (opcional)
  created_at   timestamptz default now()
);

-- (se a tabela já existia sem as colunas, garante que elas existam)
alter table public.transactions add column if not exists receipt_path text;
alter table public.transactions add column if not exists unit_value numeric;

-- Liga a "trava de segurança" (Row Level Security).
-- Sem isso, qualquer um com a chave pública leria os dados.
alter table public.transactions enable row level security;

-- Permite ler/gravar apenas para quem está LOGADO (conta da família).
drop policy if exists "acesso da familia" on public.transactions;
create policy "acesso da familia"
  on public.transactions
  for all
  to authenticated
  using (true)
  with check (true);


-- Comprovantes em PDF (Supabase Storage)
-- Cria o "porão de arquivos" (bucket) privado para os PDFs.
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

-- Permite enviar/ler/apagar PDFs apenas para quem está LOGADO
drop policy if exists "comprovantes da familia" on storage.objects;
create policy "comprovantes da familia"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'comprovantes')
  with check (bucket_id = 'comprovantes');
