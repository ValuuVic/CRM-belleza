<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">
                Cuentas
            </h2>

            <a href="{{ route('cuentas.create') }}"
               class="inline-flex items-center px-4 py-2 bg-crm-medio border border-transparent rounded-md font-semibold text-xs text-crm-texto uppercase tracking-widest hover:bg-crm-suave">
                Nueva cuenta
            </a>
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
                            <th class="px-4 py-3">Correo</th>
                            <th class="px-4 py-3">Rol</th>
                            <th class="px-4 py-3">Supervisor</th>
                            <th class="px-4 py-3">Estado</th>
                            <th class="px-4 py-3"><span class="sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 text-gray-900">
                        @foreach ($cuentas as $cuenta)
                            <tr>
                                <td class="px-4 py-3">{{ $cuenta->name }}</td>
                                <td class="px-4 py-3">{{ $cuenta->email }}</td>
                                <td class="px-4 py-3">{{ ucfirst($cuenta->rol) }}</td>
                                <td class="px-4 py-3">{{ $cuenta->supervisor?->name ?? '—' }}</td>
                                <td class="px-4 py-3">
                                    @if ($cuenta->activo)
                                        <span class="text-green-700">Activa</span>
                                    @else
                                        <span class="text-red-700">Desactivada</span>
                                    @endif
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <a href="{{ route('cuentas.edit', $cuenta) }}" class="underline text-gray-600 hover:text-gray-900">Editar</a>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</x-app-layout>
