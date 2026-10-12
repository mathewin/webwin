-- WebWin — criar o primeiro admin (rode UMA VEZ no SQL Editor)
-- Troque COLE_A_SENHA_AQUI pela senha que você escolheu (mínimo 6 caracteres).
-- Depois apague este arquivo da sua máquina. Não commite a senha.

do $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := 'admin@webw1n.shop';
  v_senha text := 'COLE_A_SENHA_AQUI';
begin
  if v_senha = 'COLE_A_SENHA_AQUI' or length(v_senha) < 6 then
    raise exception 'Troque COLE_A_SENHA_AQUI por uma senha real (mínimo 6 caracteres) antes de executar.';
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'O admin % já existe.', v_email;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_senha, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Admin WebWin"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email',
    v_id::text,
    now(),
    now(),
    now()
  );

  insert into public.profiles (id, nome, email, role, ativo, deve_trocar_senha)
  values (v_id, 'Admin WebWin', v_email, 'admin', true, true);
end $$;
