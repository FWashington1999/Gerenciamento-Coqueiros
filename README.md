# 🥥 Controle Financeiro — Coqueiros

Sistema simples e gratuito para gerenciar as finanças de uma plantação de coqueiros: controle de **entradas, saídas e imprevistos**, com gráficos, comprovantes em PDF e dados compartilhados com a família na nuvem.

### 🔗 Acesse ao vivo
**https://fwashington1999.github.io/Gerenciamento-Coqueiros/**

> Acesso protegido por senha da família.

---

## ✨ Funcionalidades

- **Lançamentos** de entradas, saídas e imprevistos, com valor, data, quantidade de cocos, **valor por coco**, descrição, categoria e forma de pagamento
- **Cálculo automático** do total (quantidade × valor por coco)
- **Indicadores (KPIs)** do ano: entradas, saídas, imprevistos e resultado
- **Gráficos**: movimento por mês (barras) e resultado acumulado (linha), com escala de valores
- **Comprovantes em PDF**: anexe e visualize o comprovante de cada lançamento
- **Exportar relatório em PDF** do ano (totais + tabela de lançamentos)
- **Login por senha única** da família
- **Dados na nuvem**, compartilhados entre todos os dispositivos
- **Responsivo**: funciona bem no computador e no celular

---

## 🛠️ Tecnologias

- **HTML, CSS e JavaScript** puro (sem frameworks, sem build)
- **[Supabase](https://supabase.com)** — banco de dados (PostgreSQL), autenticação e armazenamento dos PDFs
- **GitHub Pages** — hospedagem do site estático

---

## 📁 Estrutura

| Arquivo | Descrição |
|---|---|
| `index.html` | Estrutura da página (login + aplicativo) |
| `styles.css` | Aparência (cores, fontes, layout) |
| `app.js` | Lógica: cálculos, gráficos, exportação e conexão com o Supabase |
| `logo.png` | Logo do sistema |
| `supabase.sql` | Script que cria a tabela e o armazenamento no Supabase |

---

## ⚙️ Configuração

O sistema usa o Supabase como backend. Para rodar a sua própria cópia:

1. Crie um projeto gratuito em **[supabase.com](https://supabase.com)**.
2. No **SQL Editor**, execute o conteúdo de [`supabase.sql`](supabase.sql) (cria a tabela `transactions` e o bucket de comprovantes).
3. Em **Authentication → Users**, crie a conta da família e **desligue o cadastro público** (Authentication → Providers → Email).
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
5. Preencha os três valores no topo do [`app.js`](app.js):

```js
var SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';
var SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON';
var FAMILY_EMAIL      = 'familia@coqueiros.com';
```

> A chave `anon` e a URL são **públicas por natureza** — a proteção dos dados vem do **Row Level Security (RLS)** e do cadastro público desativado, ambos configurados pelo `supabase.sql`.

---

## 🔒 Segurança

- Os dados só são acessíveis para quem sabe a **senha da família**.
- O **RLS** bloqueia qualquer acesso não autenticado.
- Nenhuma chave secreta (`service_role`) ou senha fica no código.

---

Feito com 🥥 para a gestão da plantação da família.
