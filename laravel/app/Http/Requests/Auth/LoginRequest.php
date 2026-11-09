<?php

namespace App\Http\Requests\Auth;

use Illuminate\Auth\Events\Lockout;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /**
     * Mismo mensaje para correo inexistente y contraseña incorrecta (A2-06).
     */
    private const MENSAJE_CREDENCIALES = 'Las credenciales no coinciden con nuestros registros.';

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.required' => 'Escriba su correo.',
            'email.string' => 'Escriba su correo.',
            'email.email' => 'Escriba un correo válido.',
            'password.required' => 'Escriba su contraseña.',
            'password.string' => 'Escriba su contraseña.',
        ];
    }

    /**
     * Attempt to authenticate the request's credentials.
     *
     * Primero se comprueba la contraseña (DA2-1): solo con la contraseña correcta se dice si la cuenta
     * está desactivada o es de vendedor, y en esos casos no se inicia sesión (DA2-2).
     *
     * @throws ValidationException
     */
    public function authenticate(): void
    {
        $this->ensureIsNotRateLimited();

        if (! Auth::validate($this->only('email', 'password'))) {
            RateLimiter::hit($this->throttleKey());

            throw ValidationException::withMessages([
                'email' => self::MENSAJE_CREDENCIALES,
            ]);
        }

        RateLimiter::clear($this->throttleKey());

        $usuario = Auth::getLastAttempted();

        if ($motivo = $usuario->motivoSinPanel()) {
            $this->session()->regenerate();

            throw ValidationException::withMessages([
                'email' => $motivo,
            ]);
        }

        Auth::login($usuario, $this->boolean('remember'));
    }

    /**
     * Ensure the login request is not rate limited.
     *
     * @throws ValidationException
     */
    public function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
            return;
        }

        event(new Lockout($this));

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw ValidationException::withMessages([
            'email' => 'Demasiados intentos. Intente de nuevo en '.$seconds.' segundos.',
        ]);
    }

    /**
     * Get the rate limiting throttle key for the request.
     */
    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('email')).'|'.$this->ip());
    }
}
