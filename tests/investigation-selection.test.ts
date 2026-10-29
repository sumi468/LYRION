import { expect,it } from 'vitest';
import { InvestigationSystem } from '../src/systems/investigations';
import { createHomecomingProgress } from '../src/systems/expeditions';
it('completed nearby diagnosis does not steal the repair action inside its3.6u range',()=>{
  const p=createHomecomingProgress(),system=new InvestigationSystem();p.investigated['antenna-diagnosis']=10;
  const distances={'antenna-diagnosis':0,'antenna-repair':Math.hypot(1.6,2)};
  const target=system.nearest(p,distances);expect(target?.id).toBe('antenna-repair');
  system.request(target!.id,p,distances['antenna-repair'],true);expect(system.activeId).toBe('antenna-repair');
});
