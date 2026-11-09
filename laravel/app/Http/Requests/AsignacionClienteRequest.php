<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Asignar o reasignar (PUT) y liberar (DELETE) un cliente. Ambos formularios envían oculto vendedor_actual,
 * el dueño que mostraron (vacío = disponible), para detectar si cambió mientras se trabajaba (DA4-7).
 * Que el vendedor exista, esté activo, sea del equipo del supervisor y tenga espacio en su cartera se
 * comprueba en AsignacionClientes, con su fila bloqueada (DA4-5, DA4-6).
 */
class AsignacionClienteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'vendedor_id' => $this->isMethod('put') ? ['required', 'integer'] : ['exclude'],
            'vendedor_actual' => ['present', 'nullable', 'integer'],
        ];
    }

    /**
     * Vendedor que mostró el formulario; null si el cliente se vio disponible.
     */
    public function vendedorVisto(): ?int
    {
        return $this->filled('vendedor_actual') ? (int) $this->input('vendedor_actual') : null;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'vendedor_id.required' => 'Elija el vendedor al que se asignará el cliente.',
            'vendedor_id.integer' => 'Elija el vendedor al que se asignará el cliente.',
            'vendedor_actual.present' => 'Recargue la página e inténtelo de nuevo.',
            'vendedor_actual.integer' => 'Recargue la página e inténtelo de nuevo.',
        ];
    }
}
