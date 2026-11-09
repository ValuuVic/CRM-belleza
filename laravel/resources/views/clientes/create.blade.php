<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Nuevo cliente
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                <form method="post" action="{{ route('clientes.store') }}" class="max-w-xl space-y-6">
                    @csrf

                    @include('clientes._form', ['cliente' => null])

                    {{-- P4: vendedor opcional; vacío = el cliente nace disponible. --}}
                    <div>
                        <x-input-label for="vendedor_id" value="Vendedor (opcional)" />
                        <select id="vendedor_id" name="vendedor_id" class="mt-1 block w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
                            <option value="">— Sin asignar (disponible) —</option>
                            @foreach ($vendedores as $opcion)
                                <option value="{{ $opcion->id }}" @selected((string) old('vendedor_id') === (string) $opcion->id)>
                                    {{ $opcion->name }} · {{ $opcion->clientes_count }} de {{ $maximo }}
                                </option>
                            @endforeach
                        </select>
                        <x-input-error class="mt-2" :messages="$errors->get('vendedor_id')" />
                    </div>

                    <div class="flex items-center gap-4">
                        <x-primary-button>Crear cliente</x-primary-button>
                        <a href="{{ route('clientes.index') }}" class="underline text-sm text-gray-600 hover:text-gray-900">Cancelar</a>
                    </div>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
