<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Nuevo producto
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                <form method="post" action="{{ route('productos.store') }}" class="max-w-xl space-y-6">
                    @csrf

                    @include('productos._form', ['producto' => null])

                    <div class="flex items-center gap-4">
                        <x-primary-button>Crear producto</x-primary-button>
                        <a href="{{ route('productos.index') }}" class="underline text-sm text-gray-600 hover:text-gray-900">Cancelar</a>
                    </div>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
