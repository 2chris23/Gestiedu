import { redirect } from 'next/navigation';
import { getUserFromCookies } from '@/lib/auth-cookies';
import DashboardShell from '@/components/layout/DashboardShell';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getUserFromCookies();

    if (!user) {
        redirect('/login');
    }

    return <DashboardShell user={user}>{children}</DashboardShell>;
}
