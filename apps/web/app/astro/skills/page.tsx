import type { Metadata } from "next";
import { AstroSkills } from "@/components/astro/skills";
import { AstroIcon } from "@/components/icons/astro-icon";
import { Page } from "@/components/layout/page";

export const metadata: Metadata = { title: "Skills · Astro · Home Server" };

export default function SkillsPage() {
  return <Page section="Astro" title="Skills" Icon={AstroIcon}><AstroSkills /></Page>;
}
