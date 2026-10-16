import type { Issue } from '../../types/issue'
import type { ReportIngestDraft } from '../../types/reportIngest'

export interface ConversationTranscript {
  conversationId: string
  transcript: string
  timestamp: string
}

const dayMs = 24 * 60 * 60 * 1000

type RecentSeed = [
  issueType: string,
  severity: Issue['severity'],
  status: Issue['status'],
  daysAgo: number,
  locationLabel: string,
  latitude: number,
  longitude: number,
]

// Dated relative to load time so the 7d and 30d insights ranges have data
const recentSeeds: RecentSeed[] = [
  ['pothole', 'high', 'queued', 1, 'Hastings Street and Gore Avenue', 49.2818, -123.0962],
  ['pothole', 'high', 'queued', 4, 'Granville Street and 12th Avenue', 49.2635, -123.1408],
  ['pothole', 'medium', 'in_progress', 9, 'Kingsway and Knight Street', 49.2412, -123.0826],
  ['pothole', 'medium', 'resolved', 22, 'Main Street and 25th Avenue', 49.2459, -123.1000],
  ['pothole', 'low', 'resolved', 41, 'Oak Street and 41st Avenue', 49.2305, -123.1287],
  ['street_light', 'medium', 'queued', 2, 'Main Street and 12th Avenue', 49.2636, -123.1005],
  ['street_light', 'high', 'queued', 5, 'Commercial Drive and Venables', 49.2770, -123.0693],
  ['street_light', 'low', 'in_progress', 12, 'Broadway and Cambie Street', 49.2627, -123.1156],
  ['street_light', 'medium', 'resolved', 18, 'Robson Street and Thurlow', 49.2803, -123.1222],
  ['street_light', 'low', 'resolved', 33, 'Victoria Drive and 17th Avenue', 49.2549, -123.0697],
  ['garbage', 'medium', 'queued', 0, 'Commercial Drive and 1st Avenue', 49.2788, -123.0692],
  ['garbage', 'high', 'in_progress', 6, 'Davie Street and Denman', 49.2790, -123.1437],
  ['garbage', 'low', 'resolved', 15, 'Richards Street and Robson', 49.2795, -123.1113],
  ['garbage', 'medium', 'resolved', 27, 'Hastings and Cambie', 49.2823, -123.1148],
  ['water_leak', 'high', 'queued', 3, 'Kingsway and Fraser Street', 49.2560, -123.0872],
  ['water_leak', 'high', 'in_progress', 8, 'East 1st Avenue and Victoria', 49.2722, -123.0706],
  ['water_leak', 'medium', 'resolved', 20, 'West Broadway and Oak', 49.2629, -123.1344],
  ['graffiti', 'low', 'queued', 7, 'Burrard Street Bridge south approach', 49.2662, -123.1368],
  ['graffiti', 'low', 'in_progress', 14, 'Main Street and Broadway', 49.2627, -123.0999],
  ['graffiti', 'low', 'resolved', 36, 'Cordova and Carrall', 49.2836, -123.1063],
  ['tree', 'low', 'queued', 10, 'East Hastings and Main Street', 49.2818, -123.0995],
  ['tree', 'medium', 'resolved', 25, 'Point Grey Road and Maple', 49.2715, -123.1490],
  ['tree', 'low', 'rejected', 30, 'Dunbar Street and 16th Avenue', 49.2475, -123.1868],
  ['other', 'medium', 'queued', 1, 'Yaletown Park, Hamilton Street', 49.2742, -123.1206],
  ['other', 'low', 'resolved', 11, 'Stanley Park Drive entrance', 49.3021, -123.1400],
  ['other', 'high', 'in_progress', 4, 'Cambie Bridge north ramp', 49.2776, -123.1159],
]

const recentIssues: Issue[] = recentSeeds.map(
  ([issueType, severity, status, daysAgo, locationLabel, latitude, longitude], index) => {
    const createdAt = new Date(Date.now() - daysAgo * dayMs).toISOString()
    const updatedAt =
      status === 'resolved'
        ? new Date(Date.now() - Math.max(0, daysAgo - 2) * dayMs).toISOString()
        : createdAt
    return {
      id: `issue-recent-${index + 1}`,
      trackingId: `CF-${5001 + index}`,
      title: `${issueType.replace('_', ' ')} at ${locationLabel.split(' and ')[0]}`,
      description: `Demo ${issueType.replace('_', ' ')} report near ${locationLabel}`,
      transcript: '',
      summary: `${issueType.replace('_', ' ')} reported near ${locationLabel}`,
      issueType,
      severity,
      status,
      locationLabel,
      latitude,
      longitude,
      inputKind: index % 2 ? 'voice' : 'written',
      recommendedAction: 'Inspect site and dispatch maintenance crew',
      reporterId: 'demo-user',
      createdAt,
      updatedAt,
    }
  },
)

// 6 mock issues matching patterns from feed_demo.py, plus recent seeds
export const mockIssues: Issue[] = [
  {
    id: 'issue-001',
    trackingId: 'CF-1234',
    title: 'Pothole on Granville Street',
    description: 'Large pothole causing traffic hazard near Granville and Davie Street',
    transcript: "There's a big pothole on Granville Street near Davie. It's about 2 feet deep and has been there for weeks. Cars are getting damaged. Please fix this.",
    summary: 'Large pothole causing traffic hazard on Granville Street',
    issueType: 'pothole',
    severity: 'high',
    status: 'queued',
    locationLabel: 'Granville Street and Davie Street',
    latitude: 49.2806,
    longitude: -123.1306,
    photoDataUrl: 'https://picsum.photos/seed/pothole1/400/300.jpg',
    audioUrl: undefined,
    inputKind: 'conversation',
    recommendedAction: 'Repair pothole and reapply asphalt',
    reporterId: 'demo-user',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'issue-002',
    trackingId: 'CF-2345',
    title: 'Street Light Outage on Main Street',
    description: 'Street light not working at 12th Avenue intersection, creating safety concern',
    transcript: "The street light on Main Street at 12th Avenue has been out for 3 days. It's dark and dangerous for pedestrians crossing at night. Please fix.",
    summary: 'Street light outage creating safety concern',
    issueType: 'street_light',
    severity: 'medium',
    status: 'in_progress',
    locationLabel: 'Main Street near 12th Avenue',
    latitude: 49.2610,
    longitude: -123.1130,
    photoDataUrl: 'https://picsum.photos/seed/streetlight1/400/300.jpg',
    audioUrl: undefined,
    inputKind: 'voice',
    recommendedAction: 'Replace LED bulb and clean fixture',
    reporterId: 'demo-user',
    createdAt: '2024-01-16T14:15:00Z',
    updatedAt: '2024-01-16T15:00:00Z',
  },
  {
    id: 'issue-003',
    trackingId: 'CF-3456',
    title: 'Garbage Collection Issue on Commercial Drive',
    description: 'Multiple bags of trash left on sidewalk, blocking pedestrian passage',
    transcript: "There are bags of garbage left on the sidewalk near Commercial Drive and 1st Avenue. It's overflowing and attracting rats. Need urgent cleanup.",
    summary: 'Garbage overflow attracting rats on Commercial Drive',
    issueType: 'garbage',
    severity: 'medium',
    status: 'resolved',
    locationLabel: 'Commercial Drive near 1st Avenue',
    latitude: 49.2696,
    longitude: -123.0697,
    photoDataUrl: 'https://picsum.photos/seed/garbage1/400/300.jpg',
    audioUrl: undefined,
    inputKind: 'conversation',
    recommendedAction: 'Schedule immediate cleanup and enforce pickup schedule',
    reporterId: 'demo-user',
    createdAt: '2024-01-14T09:20:00Z',
    updatedAt: '2024-01-16T16:30:00Z',
  },
  {
    id: 'issue-004',
    trackingId: 'CF-4567',
    title: 'Water Leak on Kingsway',
    description: 'Water leaking from hydrant causing street flooding and damage',
    transcript: "Water is leaking from the hydrant on Kingsway and Fraser Street. It's been running for hours and is flooding the street. Cars are getting damaged.",
    summary: 'Water leak from hydrant flooding Kingsway',
    issueType: 'water_leak',
    severity: 'high',
    status: 'queued',
    locationLabel: 'Kingsway and Fraser Street',
    latitude: 49.2494,
    longitude: -123.0902,
    photoDataUrl: 'https://picsum.photos/seed/waterleak1/400/300.jpg',
    audioUrl: undefined,
    inputKind: 'voice',
    recommendedAction: 'Shut off water supply and repair hydrant',
    reporterId: 'demo-user',
    createdAt: '2024-01-17T08:45:00Z',
    updatedAt: '2024-01-17T08:45:00Z',
  },
  {
    id: 'issue-005',
    trackingId: 'CF-5678',
    title: 'Graffiti on Burrard Street Bridge',
    description: 'Large graffiti tags on bridge south approach, affecting aesthetics',
    transcript: "There's graffiti on the Burrard Street Bridge south approach. It's about 10 feet wide and has been there for months. The city should clean it up.",
    summary: 'Graffiti vandalism on Burrard Street Bridge',
    issueType: 'graffiti',
    severity: 'low',
    status: 'in_progress',
    locationLabel: 'Burrard Street Bridge south approach',
    latitude: 49.2756,
    longitude: -123.1284,
    photoDataUrl: 'https://picsum.photos/seed/graffiti1/400/300.jpg',
    audioUrl: undefined,
    inputKind: 'conversation',
    recommendedAction: 'Clean graffiti and consider anti-graffiti measures',
    reporterId: 'demo-user',
    createdAt: '2024-01-13T11:30:00Z',
    updatedAt: '2024-01-17T10:15:00Z',
  },
  {
    id: 'issue-006',
    trackingId: 'CF-6789',
    title: 'Tree Maintenance on East Hastings',
    description: 'Overgrown tree branches blocking street lighting and visibility',
    transcript: "The tree on East Hastings Street near Main Street is way too big. It's blocking the street light and making it hard to see at night. Please trim it.",
    summary: 'Overgrown tree blocking street lighting',
    issueType: 'tree',
    severity: 'low',
    status: 'rejected',
    locationLabel: 'East Hastings Street near Main Street',
    latitude: 49.2811,
    longitude: -123.0996,
    photoDataUrl: 'https://picsum.photos/seed/tree1/400/300.jpg',
    audioUrl: undefined,
    inputKind: 'voice',
    recommendedAction: 'Schedule tree pruning and maintenance',
    reporterId: 'demo-user',
    createdAt: '2024-01-12T16:20:00Z',
    updatedAt: '2024-01-13T14:00:00Z',
  },
  ...recentIssues,
]

export const conversationTranscripts: ConversationTranscript[] = [
  {
    conversationId: 'conv-001',
    transcript: "I need to report a pothole on Granville Street. There's a big hole about two feet deep near Davie Street. Cars are getting damaged. This has been there for weeks. Please fix this problem.",
    timestamp: '2024-01-15T10:30:00Z',
  },
  {
    conversationId: 'conv-002',
    transcript: "Street light out on Main Street at 12th Avenue intersection. It's been dark for three days. Dangerous for pedestrians crossing at night. Need this fixed urgently.",
    timestamp: '2024-01-16T14:15:00Z',
  },
  {
    conversationId: 'conv-003',
    transcript: "Garbage bags left on sidewalk near Commercial Drive and 1st Avenue. It's overflowing and attracting rats. Blocking pedestrian passage. Please arrange immediate cleanup.",
    timestamp: '2024-01-14T09:20:00Z',
  },
  {
    conversationId: 'conv-004',
    transcript: "Water leaking from hydrant on Kingsway and Fraser Street. Running for hours, flooding street. Cars getting damaged. This is an emergency situation.",
    timestamp: '2024-01-17T08:45:00Z',
  },
  {
    conversationId: 'conv-005',
    transcript: "Graffiti on Burrard Street Bridge south approach. About 10 feet wide tag that has been there for months. City should clean it up as soon as possible.",
    timestamp: '2024-01-13T11:30:00Z',
  },
  {
    conversationId: 'conv-006',
    transcript: "Tree on East Hastings Street near Main Street is too big. Blocking street light, hard to see at night. Please trim it down to reasonable size.",
    timestamp: '2024-01-12T16:20:00Z',
  },
]

export function enrichReport(draft: Partial<ReportIngestDraft>, reporterId: string): Issue {
  const issueType = draft.issueType || 'other'
  const location = draft.locationLabel || 'Unknown location'
  
  return {
    id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    trackingId: `CF-${1000 + Math.floor(Math.random() * 9000)}`,
    title: draft.title || `Report of ${issueType} at ${location.split(' ')[0]}`, 
    description: draft.description || `Issue reported for ${issueType} at ${location}`, 
    transcript: draft.transcript || '',
    summary: draft.summary || `${issueType} issue at ${location}`, 
    issueType,
    severity: draft.severity || 'medium',
    status: draft.status || 'queued',
    locationLabel: location,
    latitude: draft.latitude,
    longitude: draft.longitude,
    photoDataUrl: draft.photoUrl,
    audioUrl: undefined,
    inputKind: draft.transcript ? 'voice' : 'written',
    recommendedAction: draft.recommendedAction || 'Investigate and resolve issue',
    reporterId,
    createdAt: draft.createdAt || new Date().toISOString(),
    updatedAt: draft.createdAt || new Date().toISOString(),
  }
}

export function getMockIssues(): Issue[] {
  return [...mockIssues]
}

export function getMockIssueById(id: string): Issue | undefined {
  return mockIssues.find(issue => issue.id === id)
}

export function getMockConversationById(conversationId: string): ConversationTranscript | undefined {
  return conversationTranscripts.find(conv => conv.conversationId === conversationId)
}

export function getMockIssuesForReporter(reporterId: string): Issue[] {
  return mockIssues.filter(issue => issue.reporterId === reporterId)
}

export function getMockIssuesByStatus(status: Issue['status']): Issue[] {
  return mockIssues.filter(issue => issue.status === status)
}

export function getMockIssuesBySeverity(severity: Issue['severity']): Issue[] {
  return mockIssues.filter(issue => issue.severity === severity)
}

export function getMockIssuesByType(issueType: string): Issue[] {
  return mockIssues.filter(issue => issue.issueType === issueType)
}

