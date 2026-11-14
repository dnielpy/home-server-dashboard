import type { ComponentType, ReactNode } from "react";

import type { IconProps } from "@/components/icons/icon-props";
import { Reveal } from "@/components/ui/reveal";

type PageProps = {
  /** The module it belongs to, e.g. Energy. */
  section: string;
  title: string;
  Icon: ComponentType<IconProps>;
  /** Buttons on the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
};

/** The frame of an app page: its title under the module's name and the panels in a column. */
export function Page({ section, title, Icon, actions, children }: PageProps) {
  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-5 p-4 sm:p-6 xl:p-8">
      <Reveal index={0} className="flex items-center gap-3">
        <span className="glass flex h-10 w-10 items-center justify-center rounded-2xl text-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">{section}</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </Reveal>
      {children}
    </main>
  );
}
