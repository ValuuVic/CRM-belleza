{{-- Detalle de una oportunidad en solo lectura (L6, P4): líneas con el precio guardado e historial de etapas. --}}
@php
    use App\Models\Oportunidad;
    use App\Support\Quetzales;
    $guatemala = fn ($fecha) => $fecha?->setTimezone('America/Guatemala')->format('d/m/Y H:i') ?? '—';
@endphp

<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Oportunidad #{{ $oportunidad->id }}: {{ $oportunidad->titulo }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">
            <div class="bg-white p-4 sm:p-6 shadow-sm sm:rounded-lg text-sm text-gray-900">
                <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    <div><dt class="inline text-gray-600">Cliente:</dt> <dd class="inline">{{ $oportunidad->cliente->nombre }}</dd></div>
                    <div>
                        <dt class="inline text-gray-600">Vendedor:</dt>
                        <dd class="inline">{{ $oportunidad->vendedor->name }}{{ $oportunidad->vendedor->activo ? '' : ' (inactivo)' }}</dd>
                    </div>
                    <div><dt class="inline text-gray-600">Etapa:</dt> <dd class="inline">{{ Oportunidad::ETAPAS[$oportunidad->etapa] ?? $oportunidad->etapa }}</dd></div>
                    <div><dt class="inline text-gray-600">Cierre (hora de Guatemala):</dt> <dd class="inline">{{ $guatemala($oportunidad->fecha_cierre) }}</dd></div>
                    @if ($oportunidad->motivo_perdida)
                        <div class="sm:col-span-2"><dt class="inline text-gray-600">Motivo de pérdida:</dt> <dd class="inline">{{ $oportunidad->motivo_perdida }}</dd></div>
                    @endif
                </dl>
            </div>

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <h3 class="px-4 pt-4 text-lg font-medium text-gray-900">Productos</h3>
                <table class="mt-2 min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">Producto</th>
                            <th class="px-4 py-3 text-right">Cantidad</th>
                            <th class="px-4 py-3 text-right">Precio guardado</th>
                            <th class="px-4 py-3 text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @forelse ($lineas as $linea)
                            <tr>
                                <td class="px-4 py-3">{{ $linea->nombre }}</td>
                                <td class="px-4 py-3 text-right">{{ $linea->cantidad }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($linea->precio_unitario) }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($linea->subtotal) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="4" class="px-4 py-6 text-center text-gray-500">Esta oportunidad no tiene productos.</td>
                            </tr>
                        @endforelse
                    </tbody>
                    <tfoot class="bg-gray-50 font-medium text-gray-900">
                        <tr>
                            <td class="px-4 py-3" colspan="3">Total</td>
                            <td class="px-4 py-3 text-right">{{ Quetzales::formatear($oportunidad->total) }}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <h3 class="px-4 pt-4 text-lg font-medium text-gray-900">Historial de etapas</h3>
                <table class="mt-2 min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">Fecha (hora de Guatemala)</th>
                            <th class="px-4 py-3">De</th>
                            <th class="px-4 py-3">A</th>
                            <th class="px-4 py-3">Usuario</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @foreach ($historial as $cambio)
                            <tr>
                                <td class="px-4 py-3">{{ $guatemala($cambio->created_at) }}</td>
                                <td class="px-4 py-3">{{ $cambio->etapa_anterior ? (Oportunidad::ETAPAS[$cambio->etapa_anterior] ?? $cambio->etapa_anterior) : '—' }}</td>
                                <td class="px-4 py-3">{{ Oportunidad::ETAPAS[$cambio->etapa_nueva] ?? $cambio->etapa_nueva }}</td>
                                <td class="px-4 py-3">{{ $cambio->usuario->name }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <a href="{{ route('oportunidades.index') }}" class="underline text-sm text-gray-600 hover:text-gray-900">Volver a la lista</a>
        </div>
    </div>
</x-app-layout>
