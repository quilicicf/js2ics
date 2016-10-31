module.exports = (() => {
  'use strict';

  // Imports
  let fs = require('fs');
  let os = require('os');
  let path = require('path');

  let _ = require('lodash');
  let moment = require('moment');
  let momenttz = require('moment-timezone');

  // System stuff
  const TMPDIR = os.tmpdir();
  let SYSTEM_LINE_BREAK = os.EOL;
  let timezone = momenttz.tz.guess();

  // Configuration
  let DEFAULT_EVENT_NAME = 'New Event';
  let DEFAULT_FILE_NAME = 'calendar-event.ics';
  let DEFAULT_ATTENDEE_RSVP = false;

  // Ical format stuff
  let inputTimeFormat = 'YYYY-MM-DDTHH:mm:ssZ'; // Basically, ISO_8601
  let icalTimeFormat = 'YYYYMMDDTHHmmss';
  let timeProperty = (name, dtstamp) => {
    return name + ';TZID=' + timezone + ':' + dtstamp;
  };

  let ICAL_FORMATTERS = {
    calendarHeader: () => {
      return _.join([ 'BEGIN:VCALENDAR', 'VERSION:2.0' ], SYSTEM_LINE_BREAK);
    },
    calendarFooter: () => { return 'END:VCALENDAR'; },

    eventHeader: (dtstamp) => {
      return _.join([ '', 'BEGIN:VEVENT', timeProperty('DTSTAMP', dtstamp) ], SYSTEM_LINE_BREAK);
    },
    eventFooter: () => { return 'END:VEVENT'; },

    organizer: (organizer) => {
      return 'ORGANIZER;CN=' + organizer.name + ':MAILTO:' + organizer.email;
    },
    attendee: (attendee) => {
      return 'ATTENDEE;CN="' + attendee.name + '";RSVP=' + attendee.rsvp + ':MAILTO:' + attendee.email;
    },
    dtstart: (dtstamp) => { return timeProperty('DTSTART', dtstamp); },
    dtend: (dtstamp) => { return timeProperty('DTEND', dtstamp); },
    location: (location) => { return 'LOCATION:' + location; },
    description: (description) => { return 'DESCRIPTION:' + description; },
    summary: (summary) => { return 'SUMMARY:' + summary; }
  };

  // Declarations
  let validateDateStamp, validateDateStart, validateDateEnd,
  isValidPerson, validateOrganizer, validateAttendees,
  validateFilePath, validateCalendarOptions, validateEventOptions,
  formatCalendar, formatEvent, toFile, getCalendar, createCalendar;

  // Validation
  validateDateStamp = (dtstamp, hoursToAddIfEmpty) => {
    return dtstamp
    ? moment(dtstamp, inputTimeFormat).format(icalTimeFormat)
    : moment().add(hoursToAddIfEmpty, 'h').format(icalTimeFormat);
  };

  validateDateStart = (dtstart) => {
    return validateDateStamp(dtstart, 0);
  };

  validateDateEnd = (dtend) => {
    return validateDateStamp(dtend, 1);
  };

  isValidPerson = (person) => {
    return person && person.email && person.name;
  };

  validateOrganizer = (organizer) => {
    return isValidPerson(organizer)
    ? organizer
    : false;
  };

  validateAttendees = (attendees) => {
    return _(attendees)
    .filter(isValidPerson)
    .map((attendee) => {
      let validatedAttendee = {
        email: attendee.email,
        name: attendee.name,
        rsvp: attendee.rsvp ? attendee.rsvp : DEFAULT_ATTENDEE_RSVP
      };

      return validatedAttendee;
    })
    .value();
  };

  validateFilePath = (fileName, filePath) => {
    if (filePath) {
      return filePath;
    }

    let validFileName = fileName ? fileName : DEFAULT_FILE_NAME;
    validFileName = _.endsWith(fileName, '.ics')
    ? fileName
    : fileName + '.ics';

    return path.join(TMPDIR, validFileName);
  };

  validateCalendarOptions = (calendarOptions, filePath) => {
    if (calendarOptions.isValid) {
      return calendarOptions;
    }

    let validatedCalendarOptions = {};
    validatedCalendarOptions.filePath = validateFilePath(calendarOptions.filename, filePath);

    let events = calendarOptions.events;
    if (events) {
      validatedCalendarOptions.events = _.map(calendarOptions.events, (eventOptions) => {
        return validateEventOptions(eventOptions);
      });

    } else {
      validatedCalendarOptions.events = [ validateEventOptions({}) ];

    }
    return validatedCalendarOptions;
  };

  validateEventOptions = (eventOptions) => {
    let validatedEventOptions = {};
    validatedEventOptions.dtstamp = validateDateStamp(eventOptions.dtstamp);
    validatedEventOptions.organizer = validateOrganizer(eventOptions.organizer);
    validatedEventOptions.dtstart = validateDateStart(eventOptions.dtstart);
    validatedEventOptions.dtend = validateDateEnd(eventOptions.dtend);
    validatedEventOptions.summary = eventOptions.eventName || DEFAULT_EVENT_NAME;
    validatedEventOptions.description = eventOptions.description || '';
    validatedEventOptions.location = eventOptions.location || false;
    validatedEventOptions.attendees = validateAttendees(eventOptions.attendees);
    return validatedEventOptions;
  };

  // Real formatter stuff
  formatCalendar = (formattedEvents) => {
    let parts = [ ICAL_FORMATTERS.calendarHeader(), formattedEvents, ICAL_FORMATTERS.calendarFooter() ];
    return _.join(parts, SYSTEM_LINE_BREAK);
  };

  formatEvent = (validatedOptions) => {
    let parts = [ ICAL_FORMATTERS.eventHeader(validatedOptions.dtstamp) ];

    let organizer = validatedOptions.organizer;
    if (organizer) {
      parts.push(ICAL_FORMATTERS.organizer(organizer));
    }

    let attendees = validatedOptions.attendees;
    if (attendees) {
      _.each(attendees, (attendee) => {
        parts.push(ICAL_FORMATTERS.attendee(attendee));
      });
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

  toFile = (data, filePath, callback) => {
    fs.writeFile(filePath, data, (err, destination) => {
      if (err) { return callback(err); }
      return callback(null, destination);
    });
  };

  getCalendar = (calendarOptions) => {
    _.omit(calendarOptions, 'isValid');
    let validatedCalendarOptions = validateCalendarOptions(calendarOptions);
    let formattedEvents = _(validatedCalendarOptions.events)
    .map(formatEvent)
    .join(SYSTEM_LINE_BREAK);

    return formatCalendar(formattedEvents);
  };

  createCalendar = (calendarOptions, filePath, callback) => {
    _.omit(calendarOptions, 'isValid');
    let validatedCalendarOptions = validateCalendarOptions(calendarOptions, filePath);
    toFile(getCalendar(validatedCalendarOptions), validatedCalendarOptions.filePath, callback);
  };

  return {
    getCalendar: getCalendar,
    createCalendar: createCalendar
  };
})();
