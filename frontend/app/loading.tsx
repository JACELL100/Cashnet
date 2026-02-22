import LoadingHex from '@/components/LoadingHex';

export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-bg-primary)]">
      <LoadingHex size={64} />
    </div>
  );
}
