import React from 'react';
import { useLocation } from 'react-router-dom';
import ScreenGuide from './ScreenGuide';

const guides = {
  '/': ['Look up an expression', ['Type a word, abbreviation or phrase, like IJBOL, and submit your search.', 'Read the meaning and examples in context. Check the source when a result provides one.', 'Sign in to save a term to My Words.']],
  '/dashboard': ['Pick up where you left off', ['Use your dashboard to see your vocabulary activity.', 'Open My Words to revisit saved terms or return to Search to add something new.']],
  '/word-bank': ['Use My Words', ['Revisit the terms you saved while searching.', 'Return to Search to look up and save another expression.']],
  '/leaderboard': ['Read the leaderboard', ['Use this page to see how learners rank.', 'Return to Search to explore more terms.']],
  '/friends': ['Manage friends', ['Use this screen to find people and manage requests.', 'Open your profile to review your own account details.']],
  '/profile': ['Check your profile', ['Use your profile to see your account details and learning activity.', 'Open My Words to revisit saved expressions.']],
};

export default function AaveScreenGuide() {
  const { pathname } = useLocation();
  const route = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const guide = guides[route];
  return guide ? <ScreenGuide key={route} title={guide[0]} steps={guide[1]}/> : null;
}
