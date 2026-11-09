{{-- Lista de clientes en el alcance de la cuenta (DA4-1), con búsqueda, filtro y paginación (DA4-8). --}}
@php
    $esAdministrador = Auth::user()->rol === 'administrador';
@endphp

<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">
                Clientes
            </h2>

            <a href="{{ route('clientes.create') }}"
               class="inline-flex items-center px-4 py-2 bg-crm-medio border border-transparent rounded-md font-semibold text-xs text-crm-texto uppercase tracking-widest hover:bg-crm-suave">
                Nuevo cliente
            </a>
        </div>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-4">
            @if (session('status'))
                <div class="font-medium text-sm text-green-600">
                    {{ session('status') }}
                </div>
            @endif
            <x-input-error :messages="$errors->get('cliente')" />

            <form method="get" action="{{ route('clientes.index') }}" class="bg-white p-4 shadow-sm sm:rounded-lg flex flex-wrap items-end gap-4">
                <div class="grow">
                    <x-input-label for="q" value="Buscar por nombre o NIT" />
                    <x-text-input id="q" name="q" type="search" maxlength="100" class="mt-1 block w-full" :value="$q" />
                    <x-input-error class="mt-2" :messages="$errors->get('q')" />
                </div>

                <div>
                    <x-input-label for="vendedor" value="Vendedor" />
                    <select id="vendedor" name="vendedor" class="mt-1 block border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
                        <option value="">Todos</option>
                        <option value="sin_asignar" @selected($vendedor === 'sin_asignar')>Sin asignar</option>
                        @foreach ($vendedores as $opcion)
                            <option value="{{ $opcion->id }}" @selected($vendedor === (string) $opcion->id)>
                                {{ $opcion->name }}{{ $opcion->activo ? '' : ' (inactivo)' }}
                            </option>
                        @endforeach
                    </select>
                    <x-input-error class="mt-2" :messages="$errors->get('vendedor')" />
                </div>

                <div class="flex items-center gap-4">
                    <x-primary-button>Buscar</x-primary-button>
                    <a href="{{ route('clientes.index') }}" class="underline text-sm text-gray-600 hover:text-gray-900">Limpiar</a>
                </div>
            </form>

            <div class="bg-white overflow-x-auto shadow-sm sm:rounded-lg">
                <table class="min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th class="px-4 py-3">Nombre</th>
                            <th class="px-4 py-3">NIT</th>
                            <th class="px-4 py-3">Teléfono</th>
                            <th class="px-4 py-3">Correo</th>
                            <th class="px-4 py-3">Vendedor</th>
                            <th class="px-4 py-3"><span class="sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @forelse ($clientes as $cliente)
                            <tr>
                                <td class="px-4 py-3">{{ $cliente->nombre }}</td>
                                <td class="px-4 py-3">{{ $cliente->nit ?? 'CF' }}</td>
                                <td class="px-4 py-3">{{ $cliente->telefono }}</td>
                                <td class="px-4 py-3">{{ $cliente->correo ?? '—' }}</td>
                                <td class="px-4 py-3">
                                    @if ($cliente->vendedor)
                                        {{ $cliente->vendedor->name }} · {{ $cliente->vendedor->clientes_count }} de {{ $maximo }}
                                        @unless ($cliente->vendedor->activo)
                                            <span class="ms-1 text-red-700">(vendedor inactivo)</span>
                                        @endunless
                                    @else
                                        <span class="text-gray-500">Sin asignar</span>
                                    @endif
                                </td>
                                <td class="px-4 py-3 text-right whitespace-nowrap">
                                    <a href="{{ route('clientes.edit', $cliente) }}" class="underline text-gray-600 hover:text-gray-900">Editar</a>
                                    @if ($esAdministrador)
                                        <form method="post" action="{{ route('clientes.destroy', $cliente) }}" class="inline ms-3"
                                              onsubmit="return confirm('¿Eliminar este cliente? Sus actividades también se borrarán.')">
                                            @csrf
                                            @method('delete')
                                            <button type="submit" class="underline text-red-600 hover:text-red-800">Eliminar</button>
                                        </form>
                                    @endif
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="6" class="px-4 py-6 text-center text-gray-500">No hay clientes que coincidan con la búsqueda.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            @if ($clientes->hasPages())
                <nav class="flex items-center justify-between text-sm text-gray-600" aria-label="Paginación">
                    <span>Página {{ $clientes->currentPage() }} de {{ $clientes->lastPage() }} ({{ $clientes->total() }} clientes)</span>
                    <span class="flex gap-4">
                        @if (! $clientes->onFirstPage())
                            <a href="{{ $clientes->previousPageUrl() }}" class="underline hover:text-gray-900">Anterior</a>
                        @endif
                        @if ($clientes->hasMorePages())
                            <a href="{{ $clientes->nextPageUrl() }}" class="underline hover:text-gray-900">Siguiente</a>
                        @endif
                    </span>
                </nav>
            @endif
        </div>
    </div>
</x-app-layout>
