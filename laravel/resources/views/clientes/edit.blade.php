{{--
    Datos del cliente y, aparte, su asignación (DA4-2): asignar o reasignar, y liberar.
    vendedor_actual lleva el dueño que muestra la página, nunca old(): si cambió mientras se trabajaba,
    el servicio lo rechaza (DA4-7) y al recargar se compara contra el dueño nuevo.
--}}
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Editar cliente: {{ $cliente->nombre }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">
            @if (session('status'))
                <div class="font-medium text-sm text-green-600">
                    {{ session('status') }}
                </div>
            @endif
            <x-input-error :messages="$errors->get('cliente')" />

            <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                <h3 class="text-lg font-medium text-gray-900">Datos</h3>

                <form method="post" action="{{ route('clientes.update', $cliente) }}" class="mt-6 max-w-xl space-y-6">
                    @csrf
                    @method('put')

                    @include('clientes._form', ['cliente' => $cliente])

                    <div class="flex items-center gap-4">
                        <x-primary-button>Guardar</x-primary-button>
                        <a href="{{ route('clientes.index') }}" class="underline text-sm text-gray-600 hover:text-gray-900">Volver a la lista</a>
                    </div>
                </form>
            </div>

            <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                <h3 class="text-lg font-medium text-gray-900">Vendedor</h3>

                <p class="mt-1 text-sm text-gray-600">
                    @if ($cliente->vendedor)
                        Asignado a {{ $cliente->vendedor->name }} ({{ $cliente->vendedor->clientes_count }} de {{ $maximo }} clientes{{ $cliente->vendedor->activo ? '' : ', vendedor inactivo' }}).
                        Oportunidades abiertas: {{ $abiertas }}. Al reasignarlo, pasan al nuevo vendedor; las cerradas conservan a quien hizo la venta.
                    @else
                        Disponible: no tiene vendedor.
                    @endif
                </p>

                <form method="post" action="{{ route('clientes.asignacion.update', $cliente) }}" class="mt-6 max-w-xl space-y-6">
                    @csrf
                    @method('put')
                    <input type="hidden" name="vendedor_actual" value="{{ $cliente->vendedor_id }}">

                    <div>
                        <x-input-label for="vendedor_id" :value="$cliente->vendedor ? 'Reasignar a' : 'Asignar a'" />
                        <select id="vendedor_id" name="vendedor_id" class="mt-1 block w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm" required>
                            <option value="">— Elija un vendedor —</option>
                            @foreach ($vendedores as $opcion)
                                @continue($opcion->id === $cliente->vendedor_id)
                                <option value="{{ $opcion->id }}" @selected((string) old('vendedor_id') === (string) $opcion->id)>
                                    {{ $opcion->name }} · {{ $opcion->clientes_count }} de {{ $maximo }}
                                </option>
                            @endforeach
                        </select>
                        <x-input-error class="mt-2" :messages="$errors->get('vendedor_id')" />
                    </div>

                    <x-primary-button>{{ $cliente->vendedor ? 'Reasignar' : 'Asignar' }}</x-primary-button>
                </form>

                @if ($cliente->vendedor)
                    <form method="post" action="{{ route('clientes.asignacion.destroy', $cliente) }}" class="mt-4"
                          onsubmit="return confirm('¿Liberar este cliente? Quedará disponible para cualquier vendedor.')">
                        @csrf
                        @method('delete')
                        <input type="hidden" name="vendedor_actual" value="{{ $cliente->vendedor_id }}">
                        <x-secondary-button type="submit">Liberar cliente</x-secondary-button>
                    </form>
                @endif
            </div>
        </div>
    </div>
</x-app-layout>
