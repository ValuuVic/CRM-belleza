{{--
    Formulario compartido de alta y edición. $producto es null al crear.
    stock_original lleva siempre el stock actual de la base, nunca old(): tras un rechazo por stock
    cambiado (P2), el siguiente guardado compara contra el valor que ahora se muestra.
--}}
@php
    $activoActual = (bool) old('activo', $producto?->activo ?? true);
@endphp

<div>
    <x-input-label for="nombre" value="Nombre" />
    <x-text-input id="nombre" name="nombre" type="text" maxlength="120" class="mt-1 block w-full" :value="old('nombre', $producto?->nombre)" required autofocus autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('nombre')" />
</div>

<div>
    <x-input-label for="precio" value="Precio (Q)" />
    <x-text-input id="precio" name="precio" type="number" step="0.01" min="0.01" class="mt-1 block w-full" :value="old('precio', $producto?->precio)" required />
    <x-input-error class="mt-2" :messages="$errors->get('precio')" />
</div>

<div>
    <x-input-label for="stock" value="Existencias (déjelo vacío si no controla inventario)" />
    <x-text-input id="stock" name="stock" type="number" step="1" min="0" class="mt-1 block w-full" :value="old('stock', $producto?->stock)" />
    @if ($producto)
        <input type="hidden" name="stock_original" value="{{ $producto->stock }}">
        <p class="mt-1 text-sm text-gray-500">
            Actualmente: {{ $producto->stock === null ? 'sin control de inventario' : number_format($producto->stock).' en existencia' }}.
        </p>
    @endif
    <x-input-error class="mt-2" :messages="$errors->get('stock')" />
</div>

<div>
    <input type="hidden" name="activo" value="0">
    <label for="activo" class="inline-flex items-center">
        <input id="activo" type="checkbox" name="activo" value="1" @checked($activoActual)
               class="rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500">
        <span class="ms-2 text-sm text-gray-700">Producto activo (solo los activos se agregan a una oportunidad)</span>
    </label>
    <x-input-error class="mt-2" :messages="$errors->get('activo')" />
</div>
