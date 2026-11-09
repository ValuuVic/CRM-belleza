<?php

namespace App\Http\Requests;

use App\Models\Cliente;
use App\Support\Nit;
use App\Support\Telefono;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Alta de clientes (docs/specs/A4-clientes.md §6). Mismas reglas y mensajes que validarCliente de la API
 * (api/src/utils/validaciones.js; DA4-3, DA4-4): NIT y teléfono se validan y comparan ya normalizados.
 *
 * Los repetidos se comprueban aquí para dar el mensaje junto al campo, pero el árbitro final es el índice
 * único: AsignacionClientes traduce el 1062 si otro cliente se guarda entre la validación y el INSERT.
 * El vendedor (opcional, P4) se valida con su fila bloqueada en AsignacionClientes.
 */
class ClienteStoreRequest extends FormRequest
{
    /**
     * Mismo patrón que CORREO_VALIDO de la API.
     */
    private const CORREO_VALIDO = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/uD';

    private const MENSAJE_CORREO = 'Ingrese un correo electrónico válido o deje el campo vacío.';

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
            'nombre' => ['required', 'string', 'max:150'],
            'nit' => ['required', 'string', $this->regla(fn ($valor) => Nit::normalizar($valor)['valido'],
                'El NIT no es válido; revise el número y el dígito verificador, o use CF.')],
            'telefono' => ['required', 'string', $this->regla(fn ($valor) => Telefono::normalizar($valor)['valido'],
                'El teléfono debe tener 8 dígitos y comenzar con un dígito del 2 al 9.')],
            'correo' => ['nullable', 'string', 'max:150', 'regex:'.self::CORREO_VALIDO],
            'vendedor_id' => ['nullable', 'integer'],
        ];
    }

    /**
     * NIT y teléfono repetidos, comparados ya normalizados (R4): «4521817-k» y «4521817K» son el mismo.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $datos = $this->datos();
                $otros = Cliente::query()->when($this->clienteEditado(), fn ($q, $id) => $q->whereKeyNot($id));

                if (! $validator->errors()->has('nit') && $datos['nit'] !== null
                    && (clone $otros)->where('nit', $datos['nit'])->exists()) {
                    $validator->errors()->add('nit', 'Ya existe un cliente con ese NIT.');
                }

                if (! $validator->errors()->has('telefono') && (clone $otros)->where('telefono', $datos['telefono'])->exists()) {
                    $validator->errors()->add('telefono', 'Ya existe un cliente con ese teléfono.');
                }
            },
        ];
    }

    /**
     * Datos listos para guardar: NIT compacto (CF → NULL), teléfono de 8 dígitos y correo vacío → NULL.
     *
     * @return array{nombre: string, nit: ?string, telefono: ?string, correo: ?string}
     */
    public function datos(): array
    {
        return [
            'nombre' => $this->input('nombre'),
            'nit' => Nit::normalizar($this->input('nit'))['nit'],
            'telefono' => Telefono::normalizar($this->input('telefono'))['telefono'],
            'correo' => $this->input('correo'),
        ];
    }

    /**
     * Vendedor elegido al crear (P4); null = el cliente nace disponible.
     */
    public function vendedorId(): ?int
    {
        return $this->filled('vendedor_id') ? (int) $this->input('vendedor_id') : null;
    }

    /**
     * Id del cliente que se edita; null al crear.
     */
    protected function clienteEditado(): ?int
    {
        return null;
    }

    private function regla(Closure $esValido, string $mensaje): Closure
    {
        return function (string $atributo, mixed $valor, Closure $fallar) use ($esValido, $mensaje) {
            if (! $esValido($valor)) {
                $fallar($mensaje);
            }
        };
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'nombre.required' => 'Ingrese el nombre del cliente.',
            'nombre.string' => 'Ingrese el nombre del cliente.',
            'nombre.max' => 'El nombre no debe superar los 150 caracteres.',
            'nit.required' => 'Ingrese el NIT o CF para consumidor final.',
            'nit.string' => 'Ingrese el NIT o CF para consumidor final.',
            'telefono.required' => 'Ingrese el teléfono del cliente.',
            'telefono.string' => 'Ingrese el teléfono del cliente.',
            'correo.string' => self::MENSAJE_CORREO,
            'correo.max' => self::MENSAJE_CORREO,
            'correo.regex' => self::MENSAJE_CORREO,
            'vendedor_id.integer' => 'Elija un vendedor activo.',
        ];
    }
}
