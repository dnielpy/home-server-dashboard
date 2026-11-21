import type { Metadata } from "next";

import { TelegramIcon } from "@/components/icons/telegram-icon";
import { Page } from "@/components/layout/page";
import { TelegramPanel } from "@/components/telegram/telegram-panel";

export const metadata: Metadata = { title: "Telegram · Home Server" };

export default function Telegram() {
  return (
    <Page section="Telegram" title="Bot de la casa" Icon={TelegramIcon}>
      <TelegramPanel />
    </Page>
  );
}
