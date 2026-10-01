<?php

namespace App\Models;

/**
 * Alias de compatibilidade: pacotes/artisan esperam App\Models\User.
 * A autenticação real de alunos usa StudentUser (tabela public.users).
 */
class User extends StudentUser {}
