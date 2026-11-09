{{-- Datos del cliente, compartidos por el alta y la edición. $cliente es null al crear. NULL en el NIT se muestra como CF. --}}
<div>
    <x-input-label for="nombre" value="Nombre" />
    <x-text-input id="nombre" name="nombre" type="text" maxlength="150" class="mt-1 block w-full" :value="old('nombre', $cliente?->nombre)" required autofocus autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('nombre')" />
</div>

<div>
    <x-input-label for="nit" value="NIT (escriba CF para consumidor final)" />
    <x-text-input id="nit" name="nit" type="text" class="mt-1 block w-full" :value="old('nit', $cliente ? ($cliente->nit ?? 'CF') : null)" required autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('nit')" />
</div>

<div>
    <x-input-label for="telefono" value="Teléfono" />
    <x-text-input id="telefono" name="telefono" type="text" class="mt-1 block w-full" :value="old('telefono', $cliente?->telefono)" required autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('telefono')" />
</div>

<div>
    <x-input-label for="correo" value="Correo (opcional)" />
    <x-text-input id="correo" name="correo" type="text" maxlength="150" class="mt-1 block w-full" :value="old('correo', $cliente?->correo)" autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('correo')" />
</div>
