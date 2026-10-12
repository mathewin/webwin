import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ erro: "Faça login para continuar." }, 401);

  const { data: perfil } = await userClient
    .from("profiles")
    .select("role, ativo")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!perfil || perfil.role !== "admin" || !perfil.ativo) {
    return json({ erro: "Você não tem permissão para essa ação." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const nome = String(body.nome || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const senha = String(body.senha || "");
  const role = String(body.role || "");
  if (!nome || !email || senha.length < 6) {
    return json({ erro: "Informe nome, e-mail e senha provisória (mín. 6 caracteres)." }, 400);
  }
  if (!["vendedor", "desenvolvedor", "admin"].includes(role)) {
    return json({ erro: "Perfil inválido." }, 400);
  }

  const admin = createClient(url, service);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message || "Não foi possível criar o usuário.";
    if (/already/i.test(msg) || /registered/i.test(msg)) {
      return json({ erro: "Já existe um usuário com este e-mail." }, 409);
    }
    return json({ erro: msg }, 400);
  }

  const { error: perfilErr } = await admin.from("profiles").insert({
    id: created.user.id,
    nome,
    email,
    role,
    ativo: true,
    deve_trocar_senha: true,
  });
  if (perfilErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ erro: perfilErr.message }, 400);
  }

  await admin.from("auditoria").insert({
    usuario_id: userData.user.id,
    acao: "criar_usuario",
    tabela: "profiles",
    registro_id: created.user.id,
    detalhes: { email, role },
  });

  return json({
    id: created.user.id,
    nome,
    email,
    role,
    ativo: true,
    deve_trocar_senha: true,
  }, 201);
});
