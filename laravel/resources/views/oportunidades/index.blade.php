{{-- Oportunidades en solo lectura (L6-01): total calculado en la base, cierre en hora de Guatemala. --}}
@php
    use App\Models\Oportunidad;
    use App\Support\Quetzales;
@endphp

<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Oportunidades
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-4">
            <form method="get" action="{{ route('oportunidades.index') }}" class="bg-white p-4 shadow-sm sm:rounded-lg flex flex-wrap items-end gap-4">
                <div>
                    <x-input-label for="etapa" value="Etapa" />
                    <select id="etapa" name="etapa" class="mt-1 block border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
                        <option value="">Todas</option>
                        @foreach (Oportunidad::ETAPAS as $valor => $etiqueta)
                            <option value="{{ $valor }}" @selected($etapa === $valor)>{{ $etiqueta }}</option>
                        @endforeach
                    </select>
                    <x-input-error class="mt-2" :messages="$errors->get('etapa')" />
                </div>

                <div>
                    <x-input-label for="vendedor" value="Vendedor" />
                    <select id="vendedor" name="vendedor" class="mt-1 block border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
                        <option value="">Todos</option>
                        @foreach ($vendedores as $opcion)
                            <option value="{{ $opcion->id }}" @selected((string) $vendedor === (string) $opcion->id)>
                                {{ $opcion->name }}{{ $opcion->activo ? '' : ' (inactivo)' }}
                            </option>
                        @endforeach
                    </select>
                    <x-input-error class="mt-2" :messages="$errors->get('vendedor')" />
                </div>

                <div class="flex items-center gap-4">
                    <x-primary-button>Filtrar</x-primary-button>
                    <a href="{{ route('oportunidades.index') }}" class="underline text-sm text-gray-600 hover:text-gray-900">Limpiar</a>
                </div>
            </form>

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <table class="min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">#</th>
                            <th class="px-4 py-3">Título</th>
                            <th class="px-4 py-3">Cliente</th>
                            <th class="px-4 py-3">Vendedor</th>
                            <th class="px-4 py-3">Etapa</th>
                            <th class="px-4 py-3 text-right">Total</th>
                            <th class="px-4 py-3">Cierre (hora de Guatemala)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @forelse ($oportunidades as $oportunidad)
                            <tr>
                                <td class="px-4 py-3">{{ $oportunidad->id }}</td>
                                <td class="px-4 py-3">
                                    <a href="{{ route('oportunidades.show', $oportunidad) }}" class="underline hover:text-gray-600">{{ $oportunidad->titulo }}</a>
                                </td>
                                <td class="px-4 py-3">{{ $oportunidad->cliente->nombre }}</td>
                                <td class="px-4 py-3">
                                    {{ $oportunidad->vendedor->name }}
                                    @unless ($oportunidad->vendedor->activo)
                                        <span class="ms-1 text-red-700">(inactivo)</span>
                                    @endunless
                                </td>
                                <td class="px-4 py-3">{{ Oportunidad::ETAPAS[$oportunidad->etapa] ?? $oportunidad->etapa }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($oportunidad->total) }}</td>
                                <td class="px-4 py-3">{{ $oportunidad->fecha_cierre?->setTimezone('America/Guatemala')->format('d/m/Y H:i') ?? '—' }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="px-4 py-6 text-center text-gray-500">No hay oportunidades que coincidan con los filtros.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            @if ($oportunidades->hasPages())
                <nav class="flex items-center justify-between text-sm text-gray-600" aria-label="Paginación">
                    <span>Página {{ $oportunidades->currentPage() }} de {{ $oportunidades->lastPage() }} ({{ $oportunidades->total() }} oportunidades)</span>
                    <span class="flex gap-4">
                        @if (! $oportunidades->onFirstPage())
                            <a href="{{ $oportunidades->previousPageUrl() }}" class="underline hover:text-gray-900">Anterior</a>
                        @endif
                        @if ($oportunidades->hasMorePages())
                            <a href="{{ $oportunidades->nextPageUrl() }}" class="underline hover:text-gray-900">Siguiente</a>
                        @endif
                    </span>
                </nav>
            @endif
        </div>
    </div>
</x-app-layout>
