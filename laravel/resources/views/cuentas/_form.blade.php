{{-- Formulario compartido de alta y edición. $cuenta es null al crear. La contraseña nunca se rellena. --}}
@php
    $rolActual = old('rol', $cuenta?->rol ?? 'vendedor');
    $supervisorActual = (string) old('supervisor_id', $cuenta?->supervisor_id);
    $activoActual = (bool) old('activo', $cuenta?->activo ?? true);
@endphp

<div>
    <x-input-label for="name" value="Nombre" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $cuenta?->name)" required autofocus autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('name')" />
</div>

<div>
    <x-input-label for="email" value="Correo" />
    <x-text-input id="email" name="email" type="email" class="mt-1 block w-full" :value="old('email', $cuenta?->email)" required autocomplete="off" />
    <x-input-error class="mt-2" :messages="$errors->get('email')" />
</div>

<div>
    <x-input-label for="password" :value="$cuenta ? 'Contraseña nueva (déjela vacía para conservar la actual)' : 'Contraseña'" />
    <x-text-input id="password" name="password" type="password" class="mt-1 block w-full" :required="! $cuenta" autocomplete="new-password" />
    <x-input-error class="mt-2" :messages="$errors->get('password')" />
</div>

<div>
    <x-input-label for="password_confirmation" value="Confirme la contraseña" />
    <x-text-input id="password_confirmation" name="password_confirmation" type="password" class="mt-1 block w-full" :required="! $cuenta" autocomplete="new-password" />
</div>

<div>
    <x-input-label for="rol" value="Rol" />
    <select id="rol" name="rol" class="mt-1 block w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
        @foreach (['administrador' => 'Administrador', 'supervisor' => 'Supervisor', 'vendedor' => 'Vendedor'] as $valor => $etiqueta)
            <option value="{{ $valor }}" @selected($rolActual === $valor)>{{ $etiqueta }}</option>
        @endforeach
    </select>
    <x-input-error class="mt-2" :messages="$errors->get('rol')" />
</div>

<div>
    <x-input-label for="supervisor_id" value="Supervisor (solo para vendedores)" />
    <select id="supervisor_id" name="supervisor_id" class="mt-1 block w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm">
        <option value="">— Sin supervisor —</option>
        @foreach ($supervisores as $supervisor)
            <option value="{{ $supervisor->id }}" @selected($supervisorActual === (string) $supervisor->id)>{{ $supervisor->name }}</option>
        @endforeach
    </select>
    <x-input-error class="mt-2" :messages="$errors->get('supervisor_id')" />
</div>

<div>
    <input type="hidden" name="activo" value="0">
    <label for="activo" class="inline-flex items-center">
        <input id="activo" type="checkbox" name="activo" value="1" @checked($activoActual)
               class="rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500">
        <span class="ms-2 text-sm text-gray-700">Cuenta activa</span>
    </label>
    <x-input-error class="mt-2" :messages="$errors->get('activo')" />
</div>
