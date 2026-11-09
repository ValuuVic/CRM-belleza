<button {{ $attributes->merge(['type' => 'submit', 'class' => 'inline-flex items-center px-4 py-2 bg-crm-medio border border-transparent rounded-md font-semibold text-xs text-crm-texto uppercase tracking-widest hover:bg-crm-suave focus:bg-crm-suave active:bg-crm-medio focus:outline-none focus:ring-2 focus:ring-crm-texto focus:ring-offset-2 transition ease-in-out duration-150']) }}>
    {{ $slot }}
</button>
