// components/ui/chat/MessageAvatar.tsx
interface MessageAvatarProps {
  name: string | null | undefined;
  avatarUrl?: string | null;
  online?: boolean;
  size?: "sm" | "md";
}

export function MessageAvatar({ name, avatarUrl, online, size = "sm" }: MessageAvatarProps) {
  const sizeClass = size === "md" ? "h-9 w-9 text-xs" : "h-7 w-7 text-[10px]";
  const dotSize = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  const initial = (name?.[0] ?? "?").toUpperCase();

  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name ?? "Usuario"}
          className={`${sizeClass} rounded-full object-cover select-none`}
          onError={(e) => {
            // Si la foto falla, ocultamos el <img> para que se vea el fallback debajo.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full bg-gradient-to-br from-brand-500 to-blue-light-500 flex items-center justify-center text-white font-semibold select-none`}
        >
          {initial}
        </div>
      )}
      {online && (
        <span className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full bg-emerald-400 border-2 border-white dark:border-[#0F172A]`} />
      )}
    </div>
  );
}