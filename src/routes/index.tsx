import { createFileRoute } from "@tanstack/react-router";
import { LocatorApp } from "@/components/osiris/LocatorApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LocatorApp />;
}
