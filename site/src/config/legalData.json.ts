import { type LegalData } from "./types/configDataTypes";

// Legal content. Placeholder template text — replace it with your own terms and
// privacy policy, reviewed by a qualified legal professional, before you launch.
const legalData = {
  terms: {
    title: "Terms & Conditions",
    description: "The terms and conditions governing your use of this website.",
    lastUpdated: "2026-07-01",
    intro:
      "These terms and conditions (“Terms”) govern your access to and use of this website. Please read them carefully. This is placeholder template content — replace it with your own terms, reviewed by a qualified legal professional, before you launch.",
    sections: [
      {
        heading: "Acceptance of terms",
        body: [
          "By accessing or using this website, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, please do not use the site.",
        ],
      },
      {
        heading: "Use of the service",
        body: [
          "You may use this website for lawful purposes only. You agree not to misuse the service, interfere with its normal operation, or attempt to access it by any method other than the interface we provide.",
        ],
      },
      {
        heading: "Intellectual property",
        body: [
          "Unless otherwise stated, all content on this website — including text, graphics, logos, and code — is owned by us or our licensors and is protected by applicable intellectual-property laws. You may not reproduce or redistribute it without permission.",
        ],
      },
      {
        heading: "User content",
        body: [
          "If the site lets you submit content, you retain ownership of what you submit but grant us a non-exclusive license to host and display it as needed to operate the service. You are responsible for the content you provide.",
        ],
      },
      {
        heading: "Disclaimers",
        body: [
          "This website is provided “as is” and “as available” without warranties of any kind, whether express or implied. We do not guarantee that the site will be uninterrupted, secure, or error-free.",
        ],
      },
      {
        heading: "Limitation of liability",
        body: [
          "To the fullest extent permitted by law, we will not be liable for any indirect, incidental, or consequential damages arising from your use of, or inability to use, this website.",
        ],
      },
      {
        heading: "Changes to these terms",
        body: [
          "We may update these Terms from time to time. Material changes are reflected by the “last updated” date above, and your continued use of the site constitutes acceptance of the revised Terms.",
        ],
      },
      {
        heading: "Governing law",
        body: [
          "These Terms are governed by the laws of the jurisdiction in which we operate, without regard to conflict-of-law principles. Update this section to name your governing jurisdiction.",
        ],
      },
      {
        heading: "Contact",
        body: [
          "If you have questions about these Terms, contact us at the address published on our website.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    description: "How we collect, use, and protect your personal information.",
    lastUpdated: "2026-07-01",
    intro:
      "This privacy policy explains how we collect, use, and safeguard your personal information when you visit this website. This is placeholder template content — replace it with a policy that reflects your actual data practices and applicable law.",
    sections: [
      {
        heading: "Information we collect",
        body: [
          "We may collect information you provide directly (such as your name and email when you contact us) and information collected automatically (such as your IP address, browser type, and pages visited).",
        ],
      },
      {
        heading: "How we use your information",
        body: [
          "We use the information we collect to operate and improve the website, respond to your requests, and comply with legal obligations. We do not sell your personal information.",
        ],
      },
      {
        heading: "Cookies and tracking",
        body: [
          "This website may use cookies and similar technologies to remember your preferences and understand how the site is used. You can control cookies through your browser settings.",
        ],
      },
      {
        heading: "Sharing your information",
        body: [
          "We share personal information only with service providers who help us operate the site, or when required by law. Any such providers are bound to handle your data securely.",
        ],
      },
      {
        heading: "Data retention",
        body: [
          "We retain personal information only for as long as necessary to fulfil the purposes described in this policy, unless a longer retention period is required by law.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Depending on where you live, you may have the right to access, correct, or delete your personal information, or to object to certain processing. Contact us to exercise these rights.",
        ],
      },
      {
        heading: "Security",
        body: [
          "We take reasonable technical and organizational measures to protect your information. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
        ],
      },
      {
        heading: "Changes to this policy",
        body: [
          "We may update this policy from time to time. The “last updated” date above reflects the most recent revision.",
        ],
      },
      {
        heading: "Contact",
        body: [
          "If you have questions about this policy or your personal information, contact us at the address published on our website.",
        ],
      },
    ],
  },
} satisfies LegalData;

export default legalData;
