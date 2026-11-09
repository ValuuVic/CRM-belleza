<?php

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Confirmación de la contraseña antes de una zona protegida (A7, L7). Antes no había regla para el campo
 * vacío y el error mostraba la clave cruda «auth.password».
 */
class ConfirmPasswordRequest extends FormRequest
{
    public const MENSAJE_INCORRECTA = 'La contraseña no es correcta.';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'password' => ['required', 'string'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'password.required' => 'Escriba su contraseña.',
            'password.string' => 'Escriba su contraseña.',
        ];
    }
}
