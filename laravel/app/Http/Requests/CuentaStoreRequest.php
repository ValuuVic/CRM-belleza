<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Alta de cuentas por el administrador (docs/specs/A2-cuentas.md §6).
 *
 * Las reglas que dependen de otras filas (supervisor activo bajo bloqueo, P1, P2 y P5) se vuelven
 * a comprobar en CuentaController dentro de la transacción.
 */
class CuentaStoreRequest extends FormRequest
{
    public const ROLES = ['administrador', 'supervisor', 'vendedor'];

    public const MENSAJE_SUPERVISOR = 'Elija un supervisor activo para el vendedor.';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * El correo se compara sin distinguir mayúsculas (A2-17); activo llega de una casilla.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => is_string($this->input('email')) ? mb_strtolower(trim($this->input('email'))) : $this->input('email'),
            'activo' => $this->has('activo') ? $this->boolean('activo') : true,
        ]);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($this->cuentaEditada())],
            'password' => $this->reglasPassword(),
            'rol' => ['required', 'string', Rule::in(self::ROLES)],
            // Fuera del rol vendedor el supervisor se descarta y se guarda NULL (DA2-3).
            'supervisor_id' => [
                'exclude_unless:rol,vendedor',
                'required',
                'integer',
                Rule::exists('users', 'id')->where('rol', 'supervisor')->where('activo', true),
            ],
            'activo' => ['required', 'boolean'],
        ];
    }

    /**
     * @return array<int, string>
     */
    protected function reglasPassword(): array
    {
        return ['required', 'string', 'min:8', 'confirmed'];
    }

    /**
     * Id de la cuenta que se edita; null al crear.
     */
    protected function cuentaEditada(): ?int
    {
        return null;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Escriba el nombre de la cuenta.',
            'name.string' => 'Escriba el nombre de la cuenta.',
            'name.max' => 'El nombre no puede tener más de 255 caracteres.',
            'email.required' => 'Escriba el correo de la cuenta.',
            'email.string' => 'Escriba un correo válido.',
            'email.email' => 'Escriba un correo válido.',
            'email.max' => 'El correo no puede tener más de 255 caracteres.',
            'email.unique' => 'Ya existe una cuenta con ese correo.',
            'password.required' => 'Escriba una contraseña.',
            'password.string' => 'Escriba una contraseña.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'password.confirmed' => 'La confirmación no coincide con la contraseña.',
            'rol.required' => 'Elija el rol de la cuenta.',
            'rol.string' => 'Elija un rol válido.',
            'rol.in' => 'Elija un rol válido.',
            'supervisor_id.required' => self::MENSAJE_SUPERVISOR,
            'supervisor_id.integer' => self::MENSAJE_SUPERVISOR,
            'supervisor_id.exists' => self::MENSAJE_SUPERVISOR,
            'activo.required' => 'Indique si la cuenta está activa.',
            'activo.boolean' => 'Indique si la cuenta está activa.',
        ];
    }
}
