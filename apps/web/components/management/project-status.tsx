import { load } from "@/components/dashboard/load";
import { KNOWN_PROJECTS, projectMeta } from "@/components/management/projects";
import { StatusTile } from "@/components/ui/status-tile";
import { getProjects, type Project } from "@/lib/api";

const GRID = "grid w-full grid-cols-2 gap-4 md:grid-cols-4";

function tileStatus(project: Project) {
  const { deployed, up, since, detail } = project.service;
  return { state: deployed === false ? "idle" : up ? "up" : "down", since, detail } as const;
}

/** One card per project on the server: whether its containers are running, and since when. */
export async function ProjectStatus() {
  const { data } = await load(getProjects);
  const folders = data ? data.map((project) => project.name) : KNOWN_PROJECTS.map((project) => project.folder);

  return (
    <div className={GRID}>
      {folders.map((folder) => {
        const { name, Icon } = projectMeta(folder);
        const project = data?.find((item) => item.name === folder);
        return (
          <StatusTile
            key={folder}
            name={name}
            Icon={Icon}
            status={project && tileStatus(project)}
            unknownMessage="Unknown, the agent on the server is not answering"
          />
        );
      })}
    </div>
  );
}

export function ProjectStatusSkeleton() {
  return (
    <div className={GRID}>
      {KNOWN_PROJECTS.map(({ folder }) => (
        <div key={folder} className="glass shimmer min-h-36 rounded-2xl sm:aspect-square sm:min-h-0" />
      ))}
    </div>
  );
}
