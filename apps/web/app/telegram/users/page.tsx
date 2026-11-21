import type { Metadata } from "next";

import { UsersIcon } from "@/components/icons/users-icon";
import { Page } from "@/components/layout/page";
import { TelegramUsers } from "@/components/telegram/telegram-users";

export const metadata: Metadata = { title: "Usuarios · Telegram · Home Server" };

export default function Users() {
  return (
    <Page section="Telegram" title="Usuarios" Icon={UsersIcon}>
      <TelegramUsers />
    </Page>
  );
}
