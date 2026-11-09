<?php

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Cambio de la propia contraseña desde el perfil (A7, L7). Antes Breeze validaba en el controlador y,
 * sin archivos de traducción, mostraba las claves crudas («validation.required»).
 */
class PasswordUpdateRequest extends FormRequest
{
    /**
     * Bolsa de errores que lee profile/partials/update-password-form.blade.php.
     */
    protected $errorBag = 'updatePassword';

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
            'current_password' => ['required', 'current_password'],
            'password' => ['required', Password::defaults(), 'confirmed'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'current_password.required' => 'Escriba su contraseña actual.',
            'current_password.current_password' => 'La contraseña actual no es correcta.',
            'password.required' => 'Escriba la contraseña nueva.',
            'password.min' => 'La contraseña nueva debe tener al menos :min caracteres.',
            'password.confirmed' => 'La confirmación no coincide con la contraseña nueva.',
        ];
    }
}
