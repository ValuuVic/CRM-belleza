{{-- Lista del catálogo. El supervisor la ve en solo lectura (P1): sin botones de crear ni editar. --}}
@php
    $administra = Auth::user()->rol === 'administrador';
@endphp

<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">
                Productos
            </h2>

            @if ($administra)
                <a href="{{ route('productos.create') }}"
                   class="inline-flex items-center px-4 py-2 bg-gray-800 border border-transparent rounded-md font-semibold text-xs text-white uppercase tracking-widest hover:bg-gray-700">
                    Nuevo producto
                </a>
            @endif
        </div>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            @if (session('status'))
                <div class="mb-4 font-medium text-sm text-green-600">
                    {{ session('status') }}
                </div>
            @endif

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <table class="min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">Nombre</th>
                            <th class="px-4 py-3 text-right">Precio</th>
                            <th class="px-4 py-3">Existencias</th>
                            <th class="px-4 py-3">Estado</th>
                            @if ($administra)
                                <th class="px-4 py-3"><span class="sr-only">Acciones</span></th>
                            @endif
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @foreach ($productos as $producto)
                            <tr>
                                <td class="px-4 py-3">{{ $producto->nombre }}</td>
                                <td class="px-4 py-3 text-right">Q{{ number_format((float) $producto->precio, 2) }}</td>
                                {{-- NULL = sin control de inventario; 0 = sin existencias (A3-03). --}}
                                <td class="px-4 py-3">
                                    @if ($producto->stock === null)
                                        <span class="text-gray-500">Sin control</span>
                                    @else
                                        {{ number_format($producto->stock) }} {{ $producto->stock === 1 ? 'existencia' : 'existencias' }}
                                    @endif
                                </td>
                                <td class="px-4 py-3">
                                    @if ($producto->activo)
                                        <span class="text-green-700">Activo</span>
                                    @else
                                        <span class="text-red-700">Inactivo</span>
                                    @endif
                                </td>
                                @if ($administra)
                                    <td class="px-4 py-3 text-right">
                                        <a href="{{ route('productos.edit', $producto) }}" class="underline text-gray-600 hover:text-gray-900">Editar</a>
                                    </td>
                                @endif
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</x-app-layout>
