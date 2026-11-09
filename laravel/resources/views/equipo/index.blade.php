{{-- Equipo (L5-03): vendedores con cartera y cifras del mes. Montos formateados desde el texto DECIMAL (Quetzales). --}}
@php
    use App\Support\Quetzales;
    $esAdministrador = Auth::user()->rol === 'administrador';
@endphp

<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ $esAdministrador ? 'Equipos' : 'Mi equipo' }} · {{ $nombreMes }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">
            <form method="get" action="{{ route('equipo.index') }}" class="bg-white p-4 shadow-sm sm:rounded-lg flex flex-wrap items-end gap-4">
                <div>
                    <x-input-label for="mes" value="Mes" />
                    <x-text-input id="mes" name="mes" type="month" class="mt-1 block" :value="$mes" />
                    <x-input-error class="mt-2" :messages="$errors->get('mes')" />
                </div>
                <x-primary-button>Ver</x-primary-button>
            </form>

            @foreach ($equipos as $equipo)
                <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                    <h3 class="px-4 pt-4 text-lg font-medium text-gray-900">
                        Equipo de {{ $equipo->supervisor->name }}
                        @unless ($equipo->supervisor->activo)
                            <span class="text-sm text-red-700">(supervisor inactivo)</span>
                        @endunless
                    </h3>

                    <table class="mt-2 min-w-full divide-y divide-gray-200 text-sm">
                        <thead class="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th class="px-4 py-3">Vendedor</th>
                                <th class="px-4 py-3">Cartera</th>
                                <th class="px-4 py-3 text-right">Ventas del mes</th>
                                <th class="px-4 py-3 text-right">Total vendido</th>
                                <th class="px-4 py-3 text-right">Pronóstico</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 text-gray-900">
                            @forelse ($equipo->vendedores as $vendedor)
                                <tr>
                                    <td class="px-4 py-3">
                                        {{ $vendedor->name }}
                                        @unless ($vendedor->activo)
                                            <span class="ms-1 text-red-700">(inactivo)</span>
                                        @endunless
                                    </td>
                                    <td class="px-4 py-3">{{ $vendedor->cartera }} de {{ $maximo }}</td>
                                    <td class="px-4 py-3 text-right">{{ $vendedor->ventas }}</td>
                                    <td class="px-4 py-3 text-right">{{ Quetzales::formatear($vendedor->total) }}</td>
                                    <td class="px-4 py-3 text-right">{{ Quetzales::formatear($vendedor->pronostico) }}</td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="5" class="px-4 py-6 text-center text-gray-500">Este equipo no tiene vendedores.</td>
                                </tr>
                            @endforelse
                        </tbody>
                        <tfoot class="bg-gray-50 font-medium text-gray-900">
                            <tr>
                                <td class="px-4 py-3" colspan="2">Total del equipo</td>
                                <td class="px-4 py-3 text-right">{{ $equipo->subtotal['ventas'] }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($equipo->subtotal['total']) }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($equipo->subtotal['pronostico']) }}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            @endforeach

            @if ($empresa)
                <div class="bg-white p-4 shadow-sm sm:rounded-lg text-sm text-gray-900">
                    <span class="font-medium">Total de la empresa:</span>
                    {{ $empresa['ventas'] }} ventas · {{ Quetzales::formatear($empresa['total']) }} vendido ·
                    pronóstico {{ Quetzales::formatear($empresa['pronostico']) }}
                </div>
            @endif
        </div>
    </div>
</x-app-layout>
