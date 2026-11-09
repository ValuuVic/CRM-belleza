<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Alta de productos por el administrador (docs/specs/A3-catalogo.md §6).
 *
 * El nombre se compara con la colación de la columna (utf8mb4_unicode_ci): sin distinguir mayúsculas,
 * acentos ni espacios finales, igual que el índice único (DA3-2). El índice decide además las carreras:
 * ProductoController traduce el 1062 a un error en el campo (A3-09).
 */
class ProductoStoreRequest extends FormRequest
{
    public const MENSAJE_NOMBRE_REPETIDO = 'Ya existe un producto con ese nombre.';

    private const MENSAJE_STOCK = 'Las existencias deben ser un número entero mayor o igual a cero. Déjelo vacío si no controla inventario.';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * activo llega de una casilla; al crear, por omisión, activo.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'activo' => $this->has('activo') ? $this->boolean('activo') : true,
        ]);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:120', Rule::unique('productos', 'nombre')->ignore($this->productoEditado())],
            // DECIMAL(10,2): mayor que cero, como máximo dos decimales y sin pasar de 99 999 999.99 (DA3-3).
            'precio' => ['required', 'numeric', 'gt:0', 'decimal:0,2', 'max:99999999.99'],
            // Vacío = NULL: el producto no controla inventario (DA3-4).
            'stock' => ['nullable', 'integer', 'min:0', 'max:2147483647'],
            'activo' => ['required', 'boolean'],
        ];
    }

    /**
     * Id del producto que se edita; null al crear.
     */
    protected function productoEditado(): ?int
    {
        return null;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'nombre.required' => 'Escriba el nombre del producto.',
            'nombre.string' => 'Escriba el nombre del producto.',
            'nombre.max' => 'El nombre no debe superar los 120 caracteres.',
            'nombre.unique' => self::MENSAJE_NOMBRE_REPETIDO,
            'precio.required' => 'Escriba el precio del producto.',
            'precio.numeric' => 'Escriba el precio como un número, por ejemplo 2750.50.',
            'precio.gt' => 'El precio debe ser mayor que cero.',
            'precio.decimal' => 'El precio admite como máximo dos decimales.',
            'precio.max' => 'El precio no puede superar Q99,999,999.99.',
            'stock.integer' => self::MENSAJE_STOCK,
            'stock.min' => self::MENSAJE_STOCK,
            'stock.max' => 'Las existencias no pueden superar 2,147,483,647.',
            'activo.required' => 'Indique si el producto está activo.',
            'activo.boolean' => 'Indique si el producto está activo.',
        ];
    }
}
