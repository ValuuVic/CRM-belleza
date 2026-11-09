{{--
    Reporte mensual (L6-02). Cada cifra viene ya redondeada de la base (ReporteVentas): las filas de un
    desglose pueden no sumar exactamente el total por un centavo, y no se ajustan (A5 §5.3).
--}}
@php
    use App\Support\Quetzales;
@endphp

<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Reporte de ventas · {{ $nombreMes }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">
            <form method="get" action="{{ route('reportes.index') }}" class="bg-white p-4 shadow-sm sm:rounded-lg flex flex-wrap items-end gap-4">
                <div>
                    <x-input-label for="mes" value="Mes" />
                    <x-text-input id="mes" name="mes" type="month" class="mt-1 block" :value="$mes" />
                    <x-input-error class="mt-2" :messages="$errors->get('mes')" />
                </div>

                <div>
                    <x-input-label for="vendedor" value="Vendedor" />
                    <select id="vendedor" name="vendedor" class="mt-1 block border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
                        <option value="">Todos</option>
                        @foreach ($vendedores as $opcion)
                            <option value="{{ $opcion->id }}" @selected($vendedor === $opcion->id)>
                                {{ $opcion->name }}{{ $opcion->activo ? '' : ' (inactivo)' }}
                            </option>
                        @endforeach
                    </select>
                    <x-input-error class="mt-2" :messages="$errors->get('vendedor')" />
                </div>

                <x-primary-button>Ver</x-primary-button>
            </form>

            <div class="bg-white p-4 sm:p-6 shadow-sm sm:rounded-lg">
                <h3 class="text-lg font-medium text-gray-900">{{ $titulo }}</h3>
                <dl class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div><dt class="text-gray-600">Ventas del mes</dt><dd class="text-xl font-semibold text-gray-900">{{ $resumen['ventas'] }}</dd></div>
                    <div><dt class="text-gray-600">Total vendido</dt><dd class="text-xl font-semibold text-gray-900">{{ Quetzales::formatear($resumen['total']) }}</dd></div>
                    <div><dt class="text-gray-600">Pronóstico (oportunidades abiertas)</dt><dd class="text-xl font-semibold text-gray-900">{{ Quetzales::formatear($resumen['pronostico']) }}</dd></div>
                </dl>
            </div>

            @if ($equipos->isNotEmpty())
                <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                    <h3 class="px-4 pt-4 text-lg font-medium text-gray-900">Por equipo</h3>
                    <table class="mt-2 min-w-full divide-y divide-gray-200 text-sm">
                        <thead class="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th class="px-4 py-3">Equipo</th>
                                <th class="px-4 py-3 text-right">Ventas</th>
                                <th class="px-4 py-3 text-right">Total vendido</th>
                                <th class="px-4 py-3 text-right">Pronóstico</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 text-gray-900">
                            @foreach ($equipos as $equipo)
                                <tr>
                                    <td class="px-4 py-3">Equipo de {{ $equipo->supervisor->name }}</td>
                                    <td class="px-4 py-3 text-right">{{ $equipo->cifras['ventas'] }}</td>
                                    <td class="px-4 py-3 text-right">{{ Quetzales::formatear($equipo->cifras['total']) }}</td>
                                    <td class="px-4 py-3 text-right">{{ Quetzales::formatear($equipo->cifras['pronostico']) }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                        <tfoot class="bg-gray-50 font-medium text-gray-900">
                            <tr>
                                <td class="px-4 py-3">Empresa</td>
                                <td class="px-4 py-3 text-right">{{ $resumen['ventas'] }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($resumen['total']) }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($resumen['pronostico']) }}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            @endif

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <h3 class="px-4 pt-4 text-lg font-medium text-gray-900">Por vendedor</h3>
                <table class="mt-2 min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">Vendedor</th>
                            <th class="px-4 py-3">Cartera</th>
                            <th class="px-4 py-3 text-right">Ventas</th>
                            <th class="px-4 py-3 text-right">Total vendido</th>
                            <th class="px-4 py-3 text-right">Pronóstico</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @forelse ($porVendedor as $fila)
                            <tr>
                                <td class="px-4 py-3">
                                    {{ $fila->name }}
                                    @unless ($fila->activo)
                                        <span class="ms-1 text-red-700">(inactivo)</span>
                                    @endunless
                                </td>
                                <td class="px-4 py-3">{{ $fila->cartera }} de {{ $maximo }}</td>
                                <td class="px-4 py-3 text-right">{{ $fila->ventas }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($fila->total) }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($fila->pronostico) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="5" class="px-4 py-6 text-center text-gray-500">No hay vendedores en este reporte.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <h3 class="px-4 pt-4 text-lg font-medium text-gray-900">Por producto</h3>
                <table class="mt-2 min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">Producto</th>
                            <th class="px-4 py-3 text-right">Unidades vendidas</th>
                            <th class="px-4 py-3 text-right">Total vendido</th>
                            <th class="px-4 py-3 text-right">Pronóstico</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @forelse ($porProducto as $fila)
                            <tr>
                                <td class="px-4 py-3">
                                    {{ $fila->nombre }}
                                    @unless ($fila->activo)
                                        <span class="ms-1 text-gray-500">(inactivo)</span>
                                    @endunless
                                </td>
                                <td class="px-4 py-3 text-right">{{ $fila->unidades }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($fila->total) }}</td>
                                <td class="px-4 py-3 text-right">{{ Quetzales::formatear($fila->pronostico) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="4" class="px-4 py-6 text-center text-gray-500">No hay productos vendidos ni en oportunidades abiertas.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
                <p class="px-4 py-3 text-xs text-gray-500">Cada cifra se redondea por separado; la suma de las filas puede diferir un centavo del total.</p>
            </div>
        </div>
    </div>
</x-app-layout>
