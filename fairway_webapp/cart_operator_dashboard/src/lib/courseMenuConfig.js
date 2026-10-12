import fairwayRefreshLogo from '../../../../docs/logo_source_files/fairway-refresh/fairway-refresh-horizontal-transparent.png';
import monarchBayLogo from '../../../../docs/logo_source_files/customers/monarch-bay-golf-club/monarch-bay-golf-club-transparent.png';
import { matchCoursePresentation } from './inventoryModel.mjs';

export const courseMenuConfig = Object.freeze({
  monarchbay_tony_lema_course: Object.freeze({
    customerName: 'Monarch Bay GC',
    courseName: 'Tony Lema Course',
    timeZone: 'America/Los_Angeles',
    apiSlug: 'monarch-bay',
    fairwayLogo: fairwayRefreshLogo,
    courseLogo: monarchBayLogo,
  }),
});

export function presentationForCourse(course) {
  return matchCoursePresentation(course, Object.values(courseMenuConfig));
}