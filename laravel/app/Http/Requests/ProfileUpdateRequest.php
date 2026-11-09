<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Perfil propio: solo el nombre (P4). Cualquier otro campo del cuerpo se ignora (A2-23).
 */
class ProfileUpdateRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Escriba su nombre.',
            'name.string' => 'Escriba su nombre.',
            'name.max' => 'El nombre no puede tener más de 255 caracteres.',
        ];
    }
}
