import { notFound } from "next/navigation";
import { VIEW_IDS, viewMeta, type ViewId } from "@/lib/journey";
import { ViewSwitch } from "@/components/views/ViewSwitch";

export const dynamicParams = false;

export function generateStaticParams() {
  return VIEW_IDS.filter((v) => v !== "dashboard").map((view) => ({ view }));
}

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!VIEW_IDS.includes(view as ViewId)) return {};
  return { title: viewMeta(view as ViewId).title + " · The HR Blueprint" };
}

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!VIEW_IDS.includes(view as ViewId)) notFound();
  return <ViewSwitch id={view as ViewId} />;
}
