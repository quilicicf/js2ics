// Imports
const _ = require('lodash');
const os = require('os');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const momenttz = require('moment-timezone');

// System stuff
const TMPDIR = os.tmpdir();
const SYSTEM_LINE_BREAK = os.EOL;
const timezone = momenttz.tz.guess();

// Configuration
const DEFAULT_EVENT_NAME = 'New Event';
const DEFAULT_FILE_NAME = 'calendar-event.ics';
const DEFAULT_ATTENDEE_RSVP = false;

// Ical format stuff
const inputTimeFormat = 'YYYY-MM-DDTHH:mm:ssZ'; // Basically, ISO_8601
const icalTimeFormat = 'YYYYMMDDTHHmmss';
const timeProperty = (name, dtstamp) => `${name};TZID=${timezone}:${dtstamp}`;

const ICAL_FORMATTERS = {
  calendarHeader: () => _.join([ 'BEGIN:VCALENDAR', 'VERSION:2.0' ], SYSTEM_LINE_BREAK),
  calendarFooter: () => 'END:VCALENDAR',

  eventHeader: dtstamp => _.join([ '', 'BEGIN:VEVENT', timeProperty('DTSTAMP', dtstamp) ], SYSTEM_LINE_BREAK),
  eventFooter: () => 'END:VEVENT',

  organizer: organizer => `ORGANIZER;CN=${organizer.name}:MAILTO:${organizer.email}`,
  attendee: attendee => `ATTENDEE;CN="${attendee.name}";RSVP=${attendee.rsvp}:MAILTO:${attendee.email}`,
  dtstart: dtstamp => timeProperty('DTSTART', dtstamp),
  dtend: dtstamp => timeProperty('DTEND', dtstamp),
  location: location => `LOCATION:${location}`,
  description: description => `DESCRIPTION:${description}`,
  summary: summary => `SUMMARY:${summary}`,
};

// Declarations
const validateDateStamp = (dtstamp, hoursToAddIfEmpty) => (dtstamp
  ? moment(dtstamp, inputTimeFormat).format(icalTimeFormat)
  : moment().add(hoursToAddIfEmpty, 'h').format(icalTimeFormat));

const validateDateStart = dtstart => validateDateStamp(dtstart, 0);

const validateDateEnd = dtend => validateDateStamp(dtend, 1);

const isValidPerson = person => person && person.email && person.name;

const validateOrganizer = organizer => (isValidPerson(organizer) ? organizer : false);

const validateAttendees = attendees => _(attendees)
  .filter(isValidPerson)
  .map(attendee => ({
    email: attendee.email,
    name: attendee.name,
    rsvp: attendee.rsvp || DEFAULT_ATTENDEE_RSVP,
  }))
  .value();

const validateFilePath = (fileName, filePath) => {
  if (filePath) {
    return filePath;
  }

  const validFileName = _.endsWith(fileName || DEFAULT_FILE_NAME, '.ics')
    ? fileName
    : `${fileName}.ics`;

  return path.join(TMPDIR, validFileName);
};

const validateEventOptions = eventOptions => ({
  dtstamp: validateDateStamp(eventOptions.dtstamp),
  organizer: validateOrganizer(eventOptions.organizer),
  dtstart: validateDateStart(eventOptions.dtstart),
  dtend: validateDateEnd(eventOptions.dtend),
  summary: eventOptions.eventName || DEFAULT_EVENT_NAME,
  description: eventOptions.description || '',
  location: eventOptions.location || false,
  attendees: validateAttendees(eventOptions.attendees),
});

const validateCalendarOptions = (calendarOptions, filePath) => {
  if (calendarOptions.isValid) {
    return calendarOptions;
  }

  return {
    filePath: validateFilePath(calendarOptions.filename, filePath),
    events: calendarOptions.events
      ? _.map(calendarOptions.events, eventOptions => validateEventOptions(eventOptions))
      : [ validateEventOptions({}) ],
  };
};

const formatCalendar = formattedEvents => (
  _([ ICAL_FORMATTERS.calendarHeader(), formattedEvents, ICAL_FORMATTERS.calendarFooter() ])
    .join(SYSTEM_LINE_BREAK)
);

const formatEvent = (validatedOptions) => {
  const parts = [ ICAL_FORMATTERS.eventHeader(validatedOptions.dtstamp) ];

  const { attendees, organizer } = validatedOptions;
  if (organizer) {
    parts.push(ICAL_FORMATTERS.organizer(organizer));
  }

  if (attendees) {
    _.each(attendees, attendee => parts.push(ICAL_FORMATTERS.attendee(attendee)));
  }

  parts.push(ICAL_FORMATTERS.dtstart(validatedOptions.dtstart));
  parts.push(ICAL_FORMATTERS.dtend(validatedOptions.dtend));

  if (validatedOptions.location) {
    parts.push(ICAL_FORMATTERS.location(validatedOptions.location));
  }

  parts.push(ICAL_FORMATTERS.description(validatedOptions.description));

  parts.push(ICAL_FORMATTERS.summary(validatedOptions.summary));
  parts.push(ICAL_FORMATTERS.eventFooter());

  return _.join(parts, SYSTEM_LINE_BREAK);
};

const toFile = (data, filePath, callback) =>
  fs.writeFile(filePath, data, (err, destination) => {
    if (err) { return callback(err); }
    return callback(null, destination);
  });

const getCalendar = (calendarOptions) => {
  _.omit(calendarOptions, 'isValid');
  const validatedCalendarOptions = validateCalendarOptions(calendarOptions);
  const formattedEvents = _(validatedCalendarOptions.events)
    .map(formatEvent)
    .join(SYSTEM_LINE_BREAK);

  return formatCalendar(formattedEvents);
};

const createCalendar = (calendarOptions, filePath, callback) => {
  _.omit(calendarOptions, 'isValid');
  const validatedCalendarOptions = validateCalendarOptions(calendarOptions, filePath);
  toFile(getCalendar(validatedCalendarOptions), validatedCalendarOptions.filePath, callback);
};


module.exports = { getCalendar, createCalendar };
