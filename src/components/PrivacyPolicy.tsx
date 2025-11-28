
import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-20 animate-fade-in">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-serif font-bold text-slate-900 mb-4">Privacy Policy</h1>
        <p className="text-slate-500">Last updated: {new Date().toLocaleDateString()}</p>
      </header>

      <div className="prose prose-slate max-w-none prose-headings:font-serif">
        <p>
          At <strong>My Space</strong>, accessible from this website, one of our main priorities is the privacy of our visitors. 
          This Privacy Policy document contains types of information that is collected and recorded by My Space and how we use it.
        </p>

        <h3>Log Files</h3>
        <p>
          My Space follows a standard procedure of using log files. These files log visitors when they visit websites. 
          All hosting companies do this and a part of hosting services' analytics. The information collected by log files include 
          internet protocol (IP) addresses, browser type, Internet Service Provider (ISP), date and time stamp, referring/exit pages, 
          and possibly the number of clicks. These are not linked to any information that is personally identifiable. 
          The purpose of the information is for analyzing trends, administering the site, tracking users' movement on the website, 
          and gathering demographic information.
        </p>

        <h3>Cookies and Web Beacons</h3>
        <p>
          Like any other website, My Space uses "cookies". These cookies are used to store information including visitors' preferences, 
          and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience 
          by customizing our web page content based on visitors' browser type and/or other information.
        </p>

        <h3>Google DoubleClick DART Cookie</h3>
        <p>
          Google is one of a third-party vendor on our site. It also uses cookies, known as DART cookies, to serve ads to our site visitors 
          based upon their visit to My Space and other sites on the internet. However, visitors may choose to decline the use of 
          DART cookies by visiting the Google ad and content network Privacy Policy at the following URL – 
          <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">https://policies.google.com/technologies/ads</a>
        </p>

        <h3>Privacy Policies</h3>
        <p>
          You may consult this list to find the Privacy Policy for each of the advertising partners of My Space.
        </p>
        <p>
          Third-party ad servers or ad networks uses technologies like cookies, JavaScript, or Web Beacons that are used in their 
          respective advertisements and links that appear on My Space, which are sent directly to users' browser. 
          They automatically receive your IP address when this occurs. These technologies are used to measure the effectiveness of 
          their advertising campaigns and/or to personalize the advertising content that you see on websites that you visit.
        </p>
        <p>
          Note that My Space has no access to or control over these cookies that are used by third-party advertisers.
        </p>

        <h3>Consent</h3>
        <p>
          By using our website, you hereby consent to our Privacy Policy and agree to its Terms and Conditions.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
